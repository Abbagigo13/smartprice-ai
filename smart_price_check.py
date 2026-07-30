# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass
import json


@allow_storage
@dataclass
class PriceRecord:
    product_name: str
    category: str
    condition: str
    seller_price: u256
    market_low: u256
    market_high: u256
    verdict: str
    reason: str


class SmartPriceCheck(gl.Contract):
    next_id: u256
    history: TreeMap[u256, PriceRecord]

    def __init__(self):
        self.next_id = u256(1)

    @gl.public.write
    def check_price(
        self,
        product_name: str,
        category: str,
        condition: str,
        seller_price: int,
    ) -> int:
        prompt = f"""
You are an expert in resale/secondhand pricing across many categories of goods
(electronics, furniture, vehicles, collectibles, appliances, tools, and more).

Category: {category}
Product: {product_name}
Condition: {condition}
Seller's asking price: ${seller_price}

Estimate the typical market price range for this item in its stated category
and condition, then decide if the seller's price is "Fair Price", "Overpriced",
or "Underpriced".

Respond ONLY with JSON in this exact format:
{{"market_low": <integer>, "market_high": <integer>, "verdict": "Fair Price" | "Overpriced" | "Underpriced", "reason": "<one sentence explanation>"}}
"""

        def get_estimate():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            get_estimate,
            "market_low and market_high should be within roughly 10% of each "
            "other's values, and the verdict/reason should reach the same "
            "overall conclusion.",
        )

        data = json.loads(result_str)

        ticket_id = self.next_id
        self.history[ticket_id] = PriceRecord(
            product_name,
            category,
            condition,
            u256(seller_price),
            u256(int(data["market_low"])),
            u256(int(data["market_high"])),
            data["verdict"],
            data["reason"],
        )
        self.next_id = ticket_id + u256(1)

        # Returns the exact ticket ID this specific call created. The
        # frontend should read this value directly from the transaction
        # receipt and use it to fetch the exact record via get_result,
        # rather than assuming "the newest ticket" belongs to this call.
        return int(ticket_id)

    @gl.public.view
    def get_result(self, ticket_id: int) -> dict:
        key = u256(ticket_id)
        if key not in self.history:
            return {}
        return self._record_to_dict(self.history[key], ticket_id)

    @gl.public.view
    def get_latest(self) -> dict:
        latest_id = self.next_id - u256(1)
        if latest_id < u256(1):
            return {}
        return self._record_to_dict(self.history[latest_id], int(latest_id))

    @gl.public.view
    def get_history(self, limit: int = 20) -> list:
        ids = sorted(self.history.keys(), reverse=True)
        out = []
        for ticket_id in ids[:limit]:
            out.append(self._record_to_dict(self.history[ticket_id], int(ticket_id)))
        return out

    def _record_to_dict(self, record: PriceRecord, ticket_id: int) -> dict:
        return {
            "ticket_id": ticket_id,
            "product_name": record.product_name,
            "category": record.category,
            "condition": record.condition,
            "seller_price": int(record.seller_price),
            "market_low": int(record.market_low),
            "market_high": int(record.market_high),
            "verdict": record.verdict,
            "reason": record.reason,
        }