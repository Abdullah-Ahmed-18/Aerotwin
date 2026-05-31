import sys, json, urllib.request
url = "http://localhost:5000/api/runs/RUN_MPQ0270L_MVXI/replay"
d = json.load(urllib.request.urlopen(url))
print("runId =", d["runId"])
print("durationSec =", d["durationSec"])
print("events =", len(d["events"]))
print("checkpoints =", len(d["checkpoints"]))
print("layoutConstants =", d.get("layoutConstants"))

for i in range(1, len(d["events"])):
    assert d["events"][i]["t"] >= d["events"][i-1]["t"], "Sort violation at " + str(i)
print("PASS: global sort order")

from collections import defaultdict
pax = defaultdict(list)
for e in d["events"]:
    pax[e["passengerId"]].append(e)
violations = 0
for k, evts in pax.items():
    for i in range(1, len(evts)):
        if evts[i]["t"] < evts[i-1]["t"]:
            violations += 1
print("per-passenger order violations =", violations)

max_t = max(e["t"] for e in d["events"])
assert d["durationSec"] == max_t, "durationSec mismatch: " + str(d["durationSec"]) + " != " + str(max_t)
print("PASS: durationSec == max_t ==", max_t)
