"""
Reproducible tests for SmartPriceCheck using GenLayer's official test suite
(genlayer-test / gltest, built on pytest + genlayer-py).

Setup:
    pip install genlayer-test
    # Requires GenLayer Studio running locally (see gltest docs)

Run:
    pytest tests/test_smart_price_check.py -v
"""

from gltest import get_contract_factory, create_account
from gltest.assertions import tx_execution_succeeded


def test_check_price_persists_on_chain_and_returns_correct_ticket():
    factory = get_contract_factory("SmartPriceCheck")
    contract = factory.deploy()

    tx_receipt = contract.check_price(
        args=["Samsung Galaxy S24", "Electronics", "Used", 450]
    ).transact()

    assert tx_execution_succeeded(tx_receipt)

    ticket_id = tx_receipt.result
    assert ticket_id == 1

    record = contract.get_result(args=[ticket_id]).call()
    assert record["product_name"] == "Samsung Galaxy S24"
    assert record["category"] == "Electronics"
    assert record["condition"] == "Used"
    assert record["seller_price"] == 450
    assert record["verdict"] in ("Fair Price", "Overpriced", "Underpriced")

    record_again = contract.get_result(args=[ticket_id]).call()
    assert record_again == record


def test_history_accumulates_instead_of_overwriting():
    factory = get_contract_factory("SmartPriceCheck")
    contract = factory.deploy()

    tx_1 = contract.check_price(
        args=["IKEA Kallax Shelf Unit", "Furniture", "Refurbished", 40]
    ).transact()
    assert tx_execution_succeeded(tx_1)

    tx_2 = contract.check_price(
        args=["Mercedes Benz ML350", "Vehicles", "New", 10000]
    ).transact()
    assert tx_execution_succeeded(tx_2)

    history = contract.get_history(args=[20]).call()
    assert len(history) == 2

    product_names = {record["product_name"] for record in history}
    assert product_names == {"IKEA Kallax Shelf Unit", "Mercedes Benz ML350"}


def test_concurrent_submissions_from_different_accounts_do_not_collide():
    factory = get_contract_factory("SmartPriceCheck")
    contract = factory.deploy()

    account_a = create_account()
    account_b = create_account()

    tx_a = contract.check_price(
        args=["Trek Marlin 7 Mountain Bike", "Vehicles", "Used", 350],
        account=account_a,
    ).transact()
    tx_b = contract.check_price(
        args=["Vintage Rolex Submariner", "Collectibles", "Used", 8000],
        account=account_b,
    ).transact()

    assert tx_execution_succeeded(tx_a)
    assert tx_execution_succeeded(tx_b)

    ticket_a = tx_a.result
    ticket_b = tx_b.result

    assert ticket_a != ticket_b

    record_a = contract.get_result(args=[ticket_a]).call()
    record_b = contract.get_result(args=[ticket_b]).call()

    assert record_a["product_name"] == "Trek Marlin 7 Mountain Bike"
    assert record_b["product_name"] == "Vintage Rolex Submariner"

    history = contract.get_history(args=[20]).call()
    assert len(history) == 2