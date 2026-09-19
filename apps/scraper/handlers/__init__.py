from typing import List
from .base import BaseScraperHandler
from .examtopics import ExamTopicsHandler
from .sanfoundry import SanfoundryHandler
from .indiabix import IndiaBixHandler
from .mslearn import MsLearnHandler
from .generic import GenericHandler

# Registry of registered site handlers in priority order
HANDLERS: List[BaseScraperHandler] = [
    ExamTopicsHandler(),
    SanfoundryHandler(),
    IndiaBixHandler(),
    MsLearnHandler(),
    GenericHandler() # Fallback handler must be last
]

def get_handler_for_url(url: str) -> BaseScraperHandler:
    if not url:
        return GenericHandler()
    for handler in HANDLERS:
        if handler.can_handle(url):
            return handler
    return GenericHandler()
