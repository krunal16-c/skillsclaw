import stripe
from app.config import settings
from app.models.user import User

stripe.api_key = settings.STRIPE_SECRET_KEY

FREE_PLAN_MONTHLY_LIMIT = 3


def create_customer(email: str, name: str) -> str:
    customer = stripe.Customer.create(
        email=email,
        name=name,
    )
    return customer.id


def check_quota(user: User) -> bool:
    if user.plan == "pro":
        return True
    return user.skills_this_month < FREE_PLAN_MONTHLY_LIMIT


def create_checkout_session(
    customer_id: str, price_id: str, success_url: str, cancel_url: str
) -> str:
    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


def handle_webhook(payload: bytes, sig: str) -> dict:
    event = stripe.Webhook.construct_event(
        payload, sig, settings.STRIPE_WEBHOOK_SECRET
    )
    return event


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url
