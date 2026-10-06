import logging
import aiohttp
import json
import contextlib
from typing import Any, AsyncGenerator, Dict, List
from fastapi import HTTPException

from src.bktcortexproxyllm.core.config import settings
from src.bktcortexproxyllm.services.providers.base import LLMProvider
from src.bktcortexproxyllm.services.nlp_singleton_2 import inverted_substitutions, sanitize_content_only
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from openinference.semconv.trace import SpanAttributes
from openinference.instrumentation import using_session

# Logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s:      %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------------
# Model mapping (alias → Azure Deployment Name). Flexible: si no hay alias, usar tal cual.
# Rellena aquí si quieres usar nombres "amigables" en vez del deployment.
# Ejemplos:
#   "gpt-5-nextai" -> "gpt-5-nextai"              (si ya coincide, no hace falta)
#   "chat-prod"    -> "gpt-4o-mini-2024-07-18"    (alias → deployment real)
# ---------------------------------------------------------------------------------
MODEL_NAME_MAPPING: Dict[str, str] = {
    # "chat-prod": "gpt-4o-mini-2024-07-18",
    # "vision-prod": "gpt-4o-2024-08-06",
    # "gpt-5-nextai": "gpt-5-nextai",
    "gpt-5": "gpt-5-nextai",
    "gpt-5-chat": "gpt-5-chat-nextai",
    "gpt-4": "gpt-4-nextai",
    "gpt-4o": "gpt-4o-nextai"
}

class AzureOpenAIProvider(LLMProvider):
    """Azure OpenAI provider implementation."""
    
    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "azure"
    
    def _resolve_model(self, raw_model: str) -> str:
        """
        Devuelve el deployment name:
        - Si raw_model está en el mapping, se devuelve el mapeado.
        - Si no está, se devuelve raw_model tal cual (uso directo del deployment name).
        """
        return MODEL_NAME_MAPPING.get(raw_model, raw_model)

    def _get_azure_headers(self) -> Dict[str, str]:
        """Get headers for Azure OpenAI API requests."""
        return {
            "Content-Type": "application/json",
            "api-key": settings.AZURE_OPENAI_API_KEY
        }
    
    def _build_azure_url(self, model: str, endpoint_type: str = "chat/completions") -> str:
        """
        Build Azure OpenAI endpoint URL.
        
        Args:
            model: The deployment name in Azure (ya resuelto)
            endpoint_type: Type of endpoint (chat/completions, completions, etc.)
            
        Returns:
            str: Complete Azure OpenAI URL
        """
        base_url = settings.AZURE_OPENAI_ENDPOINT.rstrip('/')
        api_version = settings.AZURE_OPENAI_API_VERSION
        
        # En Azure, el model es el deployment name
        url = f"{base_url}/openai/deployments/{model}/{endpoint_type}?api-version={api_version}"
        return url

    # ---------- Normalización de mensajes (evita ints en content) ----------
    def _normalize_messages_for_azure(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fuerza que message.content sea string o lista de bloques válidos.
        - role="tool": si content no es string, -> str(content)
        - bloques multimodales: asegurar que 'text' y 'image_url.url' sean strings
        """
        msgs = payload.get("messages")
        if not isinstance(msgs, list):
            return payload

        def _normalize_content_list(parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            normalized: List[Dict[str, Any]] = []
            for part in parts:
                if not isinstance(part, dict):
                    # Si llega algo inesperado en lista, lo convertimos a texto
                    normalized.append({"type": "text", "text": str(part)})
                    continue

                ptype = part.get("type")
                if ptype == "text":
                    txt = part.get("text", "")
                    if not isinstance(txt, str):
                        txt = str(txt)
                    normalized.append({"type": "text", "text": txt})
                elif ptype == "image_url":
                    iu = part.get("image_url") or {}
                    url = iu.get("url") if isinstance(iu, dict) else None
                    if url is None and "url" in part:
                        url = part["url"]
                    if url is not None and not isinstance(url, str):
                        url = str(url)
                    normalized.append({"type": "image_url", "image_url": {"url": url}})
                else:
                    # Dejar otros tipos tal cual
                    normalized.append(part)
            return normalized

        for m in msgs:
            if not isinstance(m, dict):
                continue
            content = m.get("content")

            # role="tool": OpenAI exige string en content
            if m.get("role") == "tool":
                if not isinstance(content, str):
                    m["content"] = str(content)
                continue

            # Si es lista de bloques, normalizamos cada bloque
            if isinstance(content, list):
                m["content"] = _normalize_content_list(content)
                continue

            # Si no es string ni lista, convertir a string
            if not isinstance(content, str):
                m["content"] = str(content)

        return payload
    
    async def validate_request(self, request_data: Dict[str, Any]) -> bool:
        """
        Validate the request data for Azure OpenAI.
        
        Args:
            request_data: The request data to validate
            
        Returns:
            bool: Whether the request is valid
            
        Raises:
            ValueError: If the request is invalid
        """
        if not settings.AZURE_OPENAI_API_KEY:
            raise ValueError("Azure OpenAI API key not configured")
            
        if not settings.AZURE_OPENAI_ENDPOINT:
            raise ValueError("Azure OpenAI endpoint not configured")
            
        if not settings.AZURE_OPENAI_API_VERSION:
            raise ValueError("Azure OpenAI API version not configured")
        
        if not request_data.get("model"):
            raise ValueError("Model (deployment name) is required for Azure OpenAI")
        
        return True
    
    async def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a non-streaming request to Azure OpenAI.
        
        Args:
            request_data: The request data
            
        Returns:
            Dict[str, Any]: The response from Azure OpenAI
        """
        logger.info("Processing request with Azure OpenAI")
        
        try:
            await self.validate_request(request_data)
            
            raw_model = request_data.get("model")
            resolved_model = self._resolve_model(raw_model)
            url = self._build_azure_url(resolved_model, "chat/completions")
            headers = self._get_azure_headers()
            
            # Crear una copia del request sin campos específicos del proxy
            azure_request = request_data.copy()

            # Normalización de mensajes (evita ints en content, etc.)
            azure_request = self._normalize_messages_for_azure(azure_request)
            
            # Remover campos que no son parte de la API de Azure OpenAI
            fields_to_remove = [
                "provider", 
                "session_id", 
                "user_id", 
                "enable_memory", 
                "model", 
                "stream", 
                "_otel_session_id",
                "tenantId",
                "projectId",
                "itsmId",
                "itsmTicketId",
                "agent_role"
            ]
            for field in fields_to_remove:
                azure_request.pop(field, None)
            
            logger.info(f"Making request to Azure OpenAI: {url}")
            logger.info(f"Resolved model from '{raw_model}' -> '{resolved_model}'")
            logger.info(f"Request payload prepared for Azure OpenAI")
            
            # print("\n\n Texto antes de la sanitización \n")
            # print(azure_request)
            # print("\n Texto antes de la sanitización \n|n")
            
            san_request, san_subs = sanitize_content_only(azure_request, sanitize=True)
            
            # print("\n\n Texto despues de la sanitización \n")
            # print(san_request)
            # print("\n Texto despues de la sanitización \n|n")
            
            logger.info(f"Request payload sanitized for Azure OpenAI")

            tracer = trace.get_tracer("nextai.azure_openai")
            span_attrs = {
                SpanAttributes.OPENINFERENCE_SPAN_KIND: "llm",
                SpanAttributes.LLM_MODEL_NAME: resolved_model,
                getattr(SpanAttributes, "MODEL_PROVIDER", "openinference.model.provider"): "azure-openai",
                "azure.endpoint": settings.AZURE_OPENAI_ENDPOINT,
                "azure.api_version": settings.AZURE_OPENAI_API_VERSION,
                "nextai.model.requested": raw_model,
                "nextai.model.resolved": resolved_model,
                "nextai.endpoint_type": "chat/completions",
            }
            
            with tracer.start_as_current_span(name="azure.llm.chat_completions", attributes=span_attrs):
                current_span = trace.get_current_span()
                
                # Set session_id if present
                session_id = request_data.get("_otel_session_id")
                if session_id:
                    current_span.set_attribute(SpanAttributes.SESSION_ID, session_id)
                    logger.info(f"🔑 Setting session_id in span: {session_id}")
                
                # Set input messages as individual attributes
                for i, msg in enumerate(azure_request.get("messages", [])):
                    current_span.set_attribute(f"llm.input_messages.{i}.message.role", msg.get("role", ""))
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        current_span.set_attribute(f"llm.input_messages.{i}.message.content", content)
                    else:
                        current_span.set_attribute(f"llm.input_messages.{i}.message.content", str(content))

                user_messages = [m for m in azure_request.get("messages", []) if m.get("role") == "user"]
                if user_messages:
                    last_user_msg = user_messages[-1]
                    content = last_user_msg.get("content", "")
                    current_span.set_attribute(SpanAttributes.INPUT_VALUE, str(content))
                
                # Event: request start
                current_span.add_event(
                    "llm.request.start",
                    attributes={
                        "model": resolved_model,
                        "endpoint": url,
                        "message_count": len(azure_request.get("messages", []))
                    }
                )

                # Use using_session context manager to propagate session_id to child spans
                context_mgr = using_session(session_id) if session_id else contextlib.nullcontext()
                
                async with aiohttp.ClientSession() as session:
                    with context_mgr:
                        async with session.post(
                            url,
                            json=san_request,
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=120)
                        ) as response:
                            
                            if response.status >= 400:
                                error_text = await response.text()
                                logger.error(f"Azure OpenAI error: {response.status}, {error_text}")
                                
                                current_span.add_event(
                                    "llm.error",
                                    attributes={
                                        "error_status": response.status,
                                        "error_type": "http_error"
                                    }
                                )
                                
                                try:
                                    error_detail = json.loads(error_text)
                                except json.JSONDecodeError:
                                    error_detail = {"raw_error": error_text}
                                
                                current_span.set_status(Status(StatusCode.ERROR, f"HTTP {response.status}"))
                                
                                raise HTTPException(
                                    status_code=response.status,
                                    detail={
                                        "message": "Error from Azure OpenAI",
                                        "upstream_error": error_detail,
                                        "url": url
                                    }
                                )
                            
                            response_text = await response.text()
                            # logger.debug(f"response_text non inverted ofuscation: {response_text}")
                            response_data = json.loads(inverted_substitutions(response_text, substitutions=san_subs))

                            # Set output messages as individual attributes
                            if "choices" in response_data and response_data["choices"]:
                                for i, choice in enumerate(response_data["choices"]):
                                    msg = choice.get("message", {})
                                    current_span.set_attribute(f"llm.output_messages.{i}.message.role", msg.get("role", "assistant"))
                                    current_span.set_attribute(f"llm.output_messages.{i}.message.content", msg.get("content", ""))

                                    first_choice = response_data["choices"][0]
                                    assistant_msg = first_choice.get("message", {})
                                    assistant_content = assistant_msg.get("content", "")
                                    current_span.set_attribute(SpanAttributes.OUTPUT_VALUE, assistant_content)
                            
                            # logger.debug(f"response_data inverted ofuscation: {response_data}")
                            
                            # Set token usage attributes
                            usage = response_data.get("usage") or {}
                            if usage:
                                current_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_PROMPT, usage.get("prompt_tokens", 0))
                                current_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_COMPLETION, usage.get("completion_tokens", 0))
                                current_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_TOTAL, usage.get("total_tokens", 0))

                                # Event: response received
                                current_span.add_event(
                                    "llm.response.received",
                                    attributes={
                                        "status": response.status,
                                        "total_tokens": usage.get("total_tokens", 0),
                                        "completion_tokens": usage.get("completion_tokens", 0)
                                    }
                                )
                            
                            logger.debug(
                                f"Azure OpenAI request completed: raw_model={raw_model}, resolved={resolved_model}, "
                                f"tokens={response_data.get('usage', {}).get('total_tokens', 'unknown')}"
                            )
                            # logger.debug(f"Full Azure OpenAI response: {response_data}")
                            
                            # Mark span as successful
                            current_span.set_status(Status(StatusCode.OK))

                            return response_data
                    
        except HTTPException:
            # Re-raise HTTPException as-is (already handled above)
            raise
            
        except aiohttp.ClientError as exc:
            logger.error(f"HTTP client error: {str(exc)}", exc_info=True)
            try:
                current_span = trace.get_current_span()
                current_span.set_status(Status(StatusCode.ERROR, str(exc)))
                current_span.add_event(
                    "llm.error",
                    attributes={
                        "error_type": "client_error",
                        "error_message": str(exc)
                    }
                )
            except:
                pass
            raise HTTPException(
                status_code=503,
                detail=f"Connection error with Azure OpenAI: {str(exc)}"
            )
            
        except Exception as e:
            logger.error(f"Error processing Azure OpenAI request: {str(e)}", exc_info=True)
            try:
                current_span = trace.get_current_span()
                current_span.set_status(Status(StatusCode.ERROR, str(e)))
                current_span.add_event(
                    "llm.error",
                    attributes={
                        "error_type": "general_error",
                        "error_message": str(e)
                    }
                )
            except:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"Internal error: {str(e)}"
            )
    
    async def process_tokenizer_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a tokenizer request. Azure OpenAI doesn't have a separate tokenizer endpoint,
        but we can estimate using tiktoken or return an error.
        
        Args:
            request_data: The request data
            
        Returns:
            Dict[str, Any]: Token count response
        """
        logger.warning("Azure OpenAI doesn't provide a dedicated tokenizer endpoint")
        
        # Opción 1: Usar tiktoken para estimar (requiere instalar tiktoken)
        try:
            import tiktoken
            
            raw_model = request_data.get("model", "gpt-3.5-turbo")
            # Resolver alias → deployment name si procede
            resolved_model = self._resolve_model(raw_model)

            # Aceptar múltiples campos para el texto
            text = request_data.get("input") or request_data.get("text") or request_data.get("prompt") or ""
            
            # Mapear deployment names a modelos base para tiktoken (mantener mapping existente)
            # Nota: mantenemos este mapping adicional SOLO para tiktoken.
            model_mapping = {
                "gpt-35-turbo-nextai": "gpt-3.5-turbo",
                "gpt-4-nextai": "gpt-4",
                "gpt-4-32k-nextai": "gpt-4-32k",
                "gpt-4o-nextai": "gpt-4o",
                "gpt-4o-mini-nextai": "gpt-4o-mini",
                "gpt-5-nextai": "gpt-5",
                "gpt-5-chat-nextai": "gpt-5",
            }

            # Elegir nombre para tiktoken con prioridad:
            # 1) resolved_model mapeado si está en model_mapping
            # 2) raw_model mapeado si está en model_mapping
            # 3) resolved_model tal cual (p.ej. "gpt-4o")
            # 4) fallback "gpt-3.5-turbo"
            tiktoken_model = (
                model_mapping.get(resolved_model) or
                model_mapping.get(raw_model) or
                resolved_model or
                "gpt-3.5-turbo"
            )
            
            try:
                encoding = tiktoken.encoding_for_model(tiktoken_model)
            except KeyError:
                # Si el modelo no se encuentra, usar cl100k_base que es común
                encoding = tiktoken.get_encoding("cl100k_base")
            
            tokens = encoding.encode(text)
            token_count = len(tokens)
            
            return {
                "result": {
                    "token_count": token_count
                },
                "model_id": raw_model,
                "resolved_model": resolved_model,
                "tiktoken_model_used": tiktoken_model
            }
            
        except ImportError:
            # Si tiktoken no está disponible, devolver error
            raise HTTPException(
                status_code=501,
                detail="Tokenizer functionality not available for Azure OpenAI. Install tiktoken for estimation."
            )
    
    async def process_request_streaming(self, request_data: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """
        Process a streaming request to Azure OpenAI.
        
        Args:
            request_data: The request data
            
        Yields:
            str: Streaming response chunks in SSE format
        """
        logger.info("Processing streaming request with Azure OpenAI")
        
        try:
            await self.validate_request(request_data)
            
            raw_model = request_data.get("model")
            resolved_model = self._resolve_model(raw_model)
            url = self._build_azure_url(resolved_model, "chat/completions")
            headers = self._get_azure_headers()
            
            # Crear una copia del request y asegurar que stream=True
            azure_request = request_data.copy()
            azure_request["stream"] = True

            # Normalización de mensajes (evita ints en content, etc.)
            azure_request = self._normalize_messages_for_azure(azure_request)
            
            # Remover campos específicos del proxy (y model del body para Azure)
            fields_to_remove = [
                "provider", 
                "session_id", 
                "user_id", 
                "enable_memory", 
                "model", 
                "stream", 
                "_otel_session_id",
                "tenantId",
                "projectId",
                "itsmId",
                "itsmTicketId",
                "agent_role"
            ]
            for field in fields_to_remove:
                azure_request.pop(field, None)

            # Ofuscar request antes de enviarlo
            san_request, san_subs = sanitize_content_only(azure_request, sanitize=True)
            
            logger.info(f"Making streaming request to Azure OpenAI: {url}")
            logger.info(f"Resolved model from '{raw_model}' -> '{resolved_model}'")

            tracer = trace.get_tracer("nextai.azure_openai")
            span_attrs = {
                SpanAttributes.OPENINFERENCE_SPAN_KIND: "llm",
                SpanAttributes.LLM_MODEL_NAME: resolved_model,
                getattr(SpanAttributes, "MODEL_PROVIDER", "openinference.model.provider"): "azure-openai",
                "azure.endpoint": settings.AZURE_OPENAI_ENDPOINT,
                "azure.api_version": settings.AZURE_OPENAI_API_VERSION,
                "nextai.model.requested": raw_model,
                "nextai.model.resolved": resolved_model,
                "nextai.endpoint_type": "chat/completions",
                "nextai.streaming": True,
            }
            
            with tracer.start_as_current_span(name="azure.llm.chat_completions.stream", attributes=span_attrs):
                import json as json_module
                current_span = trace.get_current_span()
                
                # Set session_id if present
                session_id = request_data.get("_otel_session_id")
                if session_id:
                    current_span.set_attribute(SpanAttributes.SESSION_ID, session_id)
                
                # Set input messages as aggregated JSON (streaming format)
                current_span.set_attribute(
                    SpanAttributes.LLM_INPUT_MESSAGES,
                    json_module.dumps([{"role": m.get("role"), "content": str(m.get("content"))} 
                                    for m in azure_request.get("messages", [])])
                )
                
                collected_response = []
                
                # Event: stream start
                current_span.add_event(
                    "llm.stream.start",
                    attributes={
                        "model": resolved_model,
                        "endpoint": url
                    }
                )
                
                # Use using_session context manager to propagate session_id to child spans
                context_mgr = using_session(session_id) if session_id else contextlib.nullcontext()
                
                async with aiohttp.ClientSession() as session:
                    with context_mgr:
                        async with session.post(
                            url,
                            json=san_request,
                            headers=headers,
                            timeout=aiohttp.ClientTimeout(total=120)
                        ) as response:
                            
                            if response.status >= 400:
                                error_text = await response.text()
                                logger.error(f"Azure OpenAI streaming error: {response.status}, {error_text}")
                                
                                current_span.add_event(
                                    "llm.stream.error",
                                    attributes={
                                        "error_status": response.status,
                                        "error_type": "http_error"
                                    }
                                )
                                
                                try:
                                    error_detail = json.loads(error_text)
                                except json.JSONDecodeError:
                                    error_detail = {"raw_error": error_text}
                                
                                current_span.set_status(Status(StatusCode.ERROR, f"HTTP {response.status}"))
                                
                                raise HTTPException(
                                    status_code=response.status,
                                    detail={
                                        "message": "Streaming error from Azure OpenAI",
                                        "upstream_error": error_detail,
                                        "url": url
                                    }
                                )
                            
                            # Procesar el stream línea por línea
                            async for line in response.content:
                                if not line:
                                    continue

                                line_text = line.decode('utf-8', errors='replace').strip()

                                # Azure OpenAI devuelve datos en formato SSE
                                if line_text.startswith('data: '):
                                    # [DONE]
                                    if line_text == 'data: [DONE]':
                                        yield 'data: [DONE]\n\n'
                                        break

                                    # Desanonimizar el chunk SSE (completo)
                                    sse_chunk = line_text + '\n\n'
                                    sse_chunk = inverted_substitutions(sse_chunk, substitutions=san_subs)
                                    try:
                                        if line_text.startswith('data: ') and line_text != 'data: [DONE]':
                                            chunk_data = json.loads(line_text[6:])
                                            if chunk_data.get("choices"):
                                                delta = chunk_data["choices"][0].get("delta", {})
                                                if "content" in delta:
                                                    collected_response.append(delta["content"])
                                    except:
                                        pass
                                    yield sse_chunk

                                elif line_text:
                                    # Desanonimizar líneas varias si aparece un sustituto
                                    other = line_text + '\n'
                                    other = inverted_substitutions(other, substitutions=san_subs)
                                    yield other
                
                # Set output messages after streaming completes
                if collected_response:
                    full_text = "".join(collected_response)
                    current_span.set_attribute(
                        SpanAttributes.LLM_OUTPUT_MESSAGES,
                        json_module.dumps([{"role": "assistant", "content": full_text}])
                    )
                
                # Event: stream complete
                current_span.add_event(
                    "llm.stream.complete",
                    attributes={
                        "chunks_received": len(collected_response),
                        "total_length": len("".join(collected_response))
                    }
                )
                
                # Mark span as successful
                current_span.set_status(Status(StatusCode.OK))
                
            logger.info(f"Azure OpenAI streaming completed for model: {resolved_model}")
                
        except HTTPException:
            # Re-raise HTTPException as-is (already handled above)
            raise
            
        except aiohttp.ClientError as exc:
            logger.error(f"HTTP client error in streaming: {str(exc)}", exc_info=True)
            try:
                current_span = trace.get_current_span()
                current_span.set_status(Status(StatusCode.ERROR, str(exc)))
                current_span.add_event(
                    "llm.stream.error",
                    attributes={
                        "error_type": "client_error",
                        "error_message": str(exc)
                    }
                )
            except:
                pass
            raise HTTPException(
                status_code=503,
                detail=f"Connection error with Azure OpenAI: {str(exc)}"
            )
            
        except Exception as e:
            logger.error(f"Error in Azure OpenAI streaming: {str(e)}", exc_info=True)
            try:
                current_span = trace.get_current_span()
                current_span.set_status(Status(StatusCode.ERROR, str(e)))
                current_span.add_event(
                    "llm.stream.error",
                    attributes={
                        "error_type": "general_error",
                        "error_message": str(e)
                    }
                )
            except:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"Internal streaming error: {str(e)}"
            )