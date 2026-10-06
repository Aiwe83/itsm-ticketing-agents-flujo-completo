"""API endpoints para el LLM proxy (versión con debugging mejorado de ticketId)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status, Response
from fastapi.responses import JSONResponse, StreamingResponse

from src.bktcortexproxyllm.api.models import LLMRequest, TokenizerRequest
from src.bktcortexproxyllm.services.provider_factory import ProviderFactory

logger = logging.getLogger(__name__)
router = APIRouter()


def _extract_message_preview(messages: list[Any], max_chars: int = 100) -> str:
    """Extrae preview del último mensaje del usuario."""
    if not messages:
        return "no_messages"
    
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content", "")
            
            # Texto simple
            if isinstance(content, str):
                return content[:max_chars] + ("..." if len(content) > max_chars else "")
            
            # Contenido multimodal
            if isinstance(content, list):
                text_parts = [
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                ]
                full_text = " ".join(text_parts)
                return full_text[:max_chars] + ("..." if len(full_text) > max_chars else "")
    
    return "no_user_message"


def _extract_ticket_id_from_messages(messages: list[Any]) -> str | None:
    """
    🎫 Extrae el ticketId de los mensajes de forma exhaustiva.
    
    Busca en múltiples ubicaciones:
    1. En msg.content como OBJETO (Dict) directo.
    2. En msg.content como STRING JSON.
    3. En msg.content como LISTA multimodal.
    4. En metadatos del mensaje.
    
    Returns:
        El ticketId encontrado o None
    """
    import json
    
    for idx, msg in enumerate(messages):
        if not isinstance(msg, dict):
            continue
            
        content = msg.get("content")

        # ---------------------------------------------------------
        # 1. NUEVO: Buscar si content YA es un diccionario
        # (Esto cubre tu caso donde el JSON viene parseado)
        # ---------------------------------------------------------
        if isinstance(content, dict):
            if "itsmTicketId" in content:
                ticket_id = content["itsmTicketId"]
                logger.info(f"🎫 ✅ ticketId encontrado en msg[{idx}].content (dict nativo): {ticket_id}")
                return ticket_id

        # ---------------------------------------------------------
        # 2. Buscar en content como string JSON
        # ---------------------------------------------------------
        elif isinstance(content, str):
            try:
                # Intentamos parsear
                content_json = json.loads(content)
                # IMPORTANTE: Verificar que el resultado sea un dict antes de buscar la clave
                if isinstance(content_json, dict) and "itsmTicketId" in content_json:
                    ticket_id = content_json["itsmTicketId"]
                    logger.info(f"🎫 ✅ ticketId encontrado en msg[{idx}].content (string-json): {ticket_id}")
                    return ticket_id
            except (json.JSONDecodeError, TypeError):
                pass
        
        # ---------------------------------------------------------
        # 3. Buscar en content como lista de bloques (Multimodal)
        # ---------------------------------------------------------
        elif isinstance(content, list):
            for part_idx, part in enumerate(content):
                if isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text", "")
                    if isinstance(text, str):
                        try:
                            text_json = json.loads(text)
                            if isinstance(text_json, dict) and "itsmTicketId" in text_json:
                                ticket_id = text_json["itsmTicketId"]
                                logger.info(f"🎫 ✅ ticketId encontrado en msg[{idx}].content[{part_idx}]: {ticket_id}")
                                return ticket_id
                        except (json.JSONDecodeError, TypeError):
                            pass
        
        # ---------------------------------------------------------
        # 4. Buscar en metadata del mensaje (Legacy)
        # ---------------------------------------------------------
        metadata = msg.get("metadata")
        if isinstance(metadata, dict) and "itsmTicketId" in metadata:
            ticket_id = metadata["itsmTicketId"]
            logger.info(f"🎫 ✅ ticketId encontrado en msg[{idx}].metadata: {ticket_id}")
            return ticket_id
    
    logger.debug("🎫 ❌ No se encontró ticketId en los mensajes")
    return None


@router.post("/chat/completions", status_code=status.HTTP_200_OK)
async def proxy_chat_completion(
    request: Request,
    llm_request: LLMRequest
) -> Response:
    """Reenvía la petición al proveedor correspondiente."""
    
    # ⭐ Logging con preview del mensaje
    msg_preview = _extract_message_preview(llm_request.messages)
    logger.info(
        "📨 /chat/completions | provider=%s model=%s session=%s stream=%s", 
        llm_request.provider,
        llm_request.model,
        llm_request.session_id[:8] if llm_request.session_id else "none",
        llm_request.stream
    )
    logger.debug(f"💬 llm full request {llm_request}")
    
    request_data: dict[str, Any] = llm_request.model_dump(exclude_none=True)

    # 🎫 ESTRATEGIA DE SESSION_ID: ticketId > payload > middleware UUID
    session_id: str | None = None
    session_source: str = "none"

    # 1. 🎫 Prioridad 1: Extraer ticketId de los mensajes
    try:
        session_id = _extract_ticket_id_from_messages(llm_request.messages)
        if session_id:
            session_source = "ticketId_from_messages"
    except Exception as e:
        logger.warning(f"⚠️ Error extrayendo ticketId: {e}", exc_info=True)

    # 2. 📦 Prioridad 2: Usar session_id del payload (si existe y no hay ticketId)
    if not session_id:
        session_id = llm_request.session_id
        if session_id:
            session_source = "payload_session_id"
            logger.info(f"📦 Usando session_id del payload: {session_id}")

    # 3. 🔑 Prioridad 3: Usar UUID del middleware
    if not session_id and hasattr(request.state, "session_id"):
        session_id = request.state.session_id
        session_source = "middleware_uuid"
        logger.info(f"🔑 Usando UUID del middleware: {session_id}")

    # ✅ Añadir session_id al request_data (siempre, venga de donde venga)
    if session_id:
        request_data["session_id"] = session_id
        request_data["_otel_session_id"] = session_id
        logger.info(f"✅ Session final para OTEL: {session_id} (fuente: {session_source})")
    else:
        logger.warning("⚠️ No hay session_id disponible")
    
    user_id: str = llm_request.user_id
    enable_memory: bool = llm_request.enable_memory
    
    user_context = {}
    if hasattr(request.state, "user_context"):
        user_context = request.state.user_context
        context_user_id = user_context.get("client_id")
        if context_user_id:
            user_id = context_user_id
            request_data["user_id"] = user_id

    try:
        result = await ProviderFactory.process_request(request_data)

        if isinstance(result, StreamingResponse):
            if session_id:
                result.headers["X-Session-Id"] = session_id
                result.headers["X-Session-Source"] = session_source
                result.headers["X-Memory-Enabled"] = str(enable_memory)
            return result

        resp = JSONResponse(content=result)
        if session_id:
            resp.headers["X-Session-Id"] = session_id
            resp.headers["X-Session-Source"] = session_source
            resp.headers["X-Memory-Enabled"] = str(enable_memory)
        return resp

    except Exception as exc:
        logger.error("❌ Error processing request: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing request: {exc}",
        ) from exc   
        
        
@router.post("/eval/chat/completions", status_code=status.HTTP_200_OK)
async def proxy_eval_completion(
    request: Request,
    llm_request: LLMRequest,
) -> Response:
    """Endpoint de evaluación - reenvía al proveedor."""
    
    msg_preview = _extract_message_preview(llm_request.messages)
    logger.info(
        "📊 /eval/chat/completions | provider=%s model=%s session=%s | msg='%s'",
        llm_request.provider,
        llm_request.model,
        llm_request.session_id[:8] if llm_request.session_id else "none",
        msg_preview
    )
    
    request_data: dict[str, Any] = llm_request.model_dump(exclude_none=True)
    
    # 🎫 ESTRATEGIA DE SESSION_ID: ticketId > payload > middleware UUID
    session_id: str | None = None
    session_source: str = "none"

    # 1. 🎫 Prioridad 1: Extraer ticketId de los mensajes
    try:
        session_id = _extract_ticket_id_from_messages(llm_request.messages)
        if session_id:
            session_source = "ticketId_from_messages"
    except Exception as e:
        logger.warning(f"⚠️ Error extrayendo ticketId: {e}", exc_info=True)

    # 2. 📦 Prioridad 2: Usar session_id del payload (si existe y no hay ticketId)
    if not session_id:
        session_id = llm_request.session_id
        if session_id:
            session_source = "payload_session_id"
            logger.info(f"📦 Usando session_id del payload: {session_id}")

    # 3. 🔑 Prioridad 3: Usar UUID del middleware
    if not session_id and hasattr(request.state, "session_id"):
        session_id = request.state.session_id
        session_source = "middleware_uuid"
        logger.info(f"🔑 Usando UUID del middleware: {session_id}")

    # ✅ Añadir session_id al request_data (siempre, venga de donde venga)
    if session_id:
        request_data["session_id"] = session_id
        request_data["_otel_session_id"] = session_id
        logger.info(f"✅ Session final para OTEL: {session_id} (fuente: {session_source})")
    
    user_id: str = llm_request.user_id
    enable_memory: bool = llm_request.enable_memory
    
    user_context = {}
    if hasattr(request.state, "user_context"):
        user_context = request.state.user_context
        context_user_id = user_context.get("client_id")
        if context_user_id:
            user_id = context_user_id
            request_data["user_id"] = user_id

    try:
        result = await ProviderFactory.process_request(request_data)

        if isinstance(result, StreamingResponse):
            if session_id:
                result.headers["X-Session-Id"] = session_id
                result.headers["X-Session-Source"] = session_source
                result.headers["X-Memory-Enabled"] = str(enable_memory)
            return result

        resp = JSONResponse(content=result)
        if session_id:
            resp.headers["X-Session-Id"] = session_id
            resp.headers["X-Session-Source"] = session_source
            resp.headers["X-Memory-Enabled"] = str(enable_memory)
        return resp

    except Exception as exc:
        logger.error("❌ Error processing eval request: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing request: {exc}",
        ) from exc   


@router.post("/text/tokenization", status_code=status.HTTP_200_OK)
async def proxy_tokenization(
    request: Request,
    tokenizer_request: TokenizerRequest,
) -> Response:
    """Endpoint de tokenización."""
    
    input_preview = tokenizer_request.input[:100] + ("..." if len(tokenizer_request.input) > 100 else "")
    logger.info(
        "🔢 /text/tokenization | provider=%s model=%s | input='%s'",
        tokenizer_request.provider,
        tokenizer_request.model,
        input_preview
    )
    
    request_data: dict[str, Any] = tokenizer_request.model_dump(exclude_none=True)

    try:
        result = await ProviderFactory.process_tokenizer_request(request_data)
        return JSONResponse(content=result)

    except Exception as exc:
        logger.error("❌ Error processing tokenization: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing request: {exc}",
        ) from exc