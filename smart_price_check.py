# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

class SmartPriceCheck(gl.Contract):
    product_name: str
    seller_price: bigint
    market_low: bigint
    market_high: bigint
    verdict: str
    reason: str

    def __init__(self):
        self.product_name = ""
        self.seller_price = bigint(0)
        self.market_low = bigint(0)
        self.market_high = bigint(0)
        self.verdict = ""
        self.reason = ""

    @gl.public.write
    def check_price(self, product_name: str, seller_price: int) -> None:
        prompt = f"""
You are an expert in resale/secondhand electronics pricing.

Product: {product_name}
Seller's asking price: ${seller_price}

Estimate the typical market price range for this product in good used condition,
then decide if the seller's price is "Fair Price", "Overpriced", or "Underpriced".

Respond ONLY with JSON in this exact format:
{{"market_low": <integer>, "market_high": <integer>, "verdict": "Fair Price" | "Overpriced" | "Underpriced", "reason": "<one sentence explanation>"}}
"""

        def get_estimate():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_str = gl.eq_principle.prompt_comparative(
            get_estimate,
            "market_low and market_high should be within roughly 10% of each other's values, and the verdict/reason should reach the same overall conclusion."
        )

        data = json.loads(result_str)
        self.product_name = product_name
        self.seller_price = bigint(seller_price)
        self.market_low = bigint(data["market_low"])
        self.market_high = bigint(data["market_high"])
        self.verdict = data["verdict"]
        self.reason = data["reason"]

    @gl.public.view
    def get_result(self) -> dict:
        return {
            "product_name": self.product_name,
            "seller_price": int(self.seller_price),
            "market_low": int(self.market_low),
            "market_high": int(self.market_high),
            "verdict": self.verdict,
            "reason": self.reason,
        }