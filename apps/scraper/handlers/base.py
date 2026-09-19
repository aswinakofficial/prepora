import re
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

class BaseScraperHandler:
    name: str = "BaseHandler"
    domain_patterns: List[str] = []

    def can_handle(self, url: str) -> bool:
        if not url:
            return False
        for pattern in self.domain_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
        return False

    def parse_questions(self, html: str, target_url: str, exam: str, subject: str, parser_mode: str = "mcq") -> List[Dict]:
        """Override in subclasses to parse questions specifically for a domain."""
        raise NotImplementedError

    def discover_next_links(self, html: str, current_url: str) -> List[str]:
        """Override in subclasses to support deep multi-page pagination crawl."""
        return []
