from typing import List
import pandas as pd

def nrdb_query(nrql: str, account_id: str, api_key: str) -> pd.DataFrame:
    """
    Placeholder that fakes an NRDB result set so the pipeline runs end-to-end.
    In Turn 2, we'll swap in a real NerdGraph POST.
    """
    import random, datetime as dt
    rows: List[dict] = []
    for i in range(1, 40):
        rows.append(
            {
                "timestamp": (dt.datetime.utcnow() - dt.timedelta(seconds=40-i)).isoformat()+"Z",
                "service.name": random.choice(["checkout-svc", "payment-svc", "shipper-svc"]),
                "message": f"Order orderId={123+i} stage={random.choice(['publish','consume','charge','ship'])}",
            }
        )
    return pd.DataFrame(rows)
