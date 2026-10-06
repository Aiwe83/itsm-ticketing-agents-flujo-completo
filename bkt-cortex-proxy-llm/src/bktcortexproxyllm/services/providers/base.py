"""Base provider class for LLM interfaces."""
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, Optional


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Get the provider name."""
        pass
    
    @abstractmethod
    async def validate_request(self, request_data: Dict[str, Any]) -> bool:
        """
        Validate the request data before processing.
        
        Args:
            request_data: The request data to validate
            
        Returns:
            bool: Whether the request is valid
            
        Raises:
            ValueError: If the request is invalid
        """
        pass
    
    @abstractmethod
    async def process_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a request to the LLM provider.
        
        Args:
            request_data: The request data in the standardized format
            
        Returns:
            Dict[str, Any]: The response data in the standardized format
        """
        pass
    
    @abstractmethod
    async def process_tokenizer_request(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a tokenizer request to the LLM provider.
        
        Args:
            request_data: The request data in the standardized format
            
        Returns:
            Dict[str, Any]: The response data in the standardized format
        """
        pass
    
    async def process_request_streaming(
        self, request_data: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process a streaming request to the LLM provider.
        
        Args:
            request_data: The request data in the standardized format
            
        Yields:
            Dict[str, Any]: Chunks of the response in the standardized format
        """
        raise NotImplementedError(
            f"Streaming not implemented for provider {self.provider_name}"
        )