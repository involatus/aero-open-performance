#!/usr/bin/env python3
"""Independent reference calculator written only from docs/FORMAT.md.

Usage: calculate.py <aircraft.json> <inputs.jsonl>
       calculate.py --check <aircraft.json>
"""
import json
import math
import sys

EPS = 1e-9
LB = 0.45359237
FT = 0.3048
LENGTH = {"m": 1.0, "ft": FT, "in": 0.0254, "cm": 0.01}


class Stop(Exception):
    def __init__(self, status):
        self.status = status


def by_id(items, key):
    for it in items:
        if it["id"] == key:
            return it
    return None


# ---------------------------------------------------------------- mass and balance
def burn(tanks, fuel, plan, burned):
    """Returns (remaining volumes by tank id, leftover burn)."""
    rem = {t["id"]: fuel.get(t["id"], 0.0) for t in tanks}
    left = burned
    if plan["type"] == "sequence":
        for tid in plan["tanks"]:
            if left <= 0:
                break
            take = min(left, rem.get(tid, 0.0))
            rem[tid] = rem.get(tid, 0.0) - take
            left -= take
        # AMBIGUITY: leftover after the listed tanks are empty counts as "exceeds the
        # fuel" even if an unlisted tank still holds fuel (FORMAT.md says the landing
        # fuel is then "zero", which is only true if all tanks are listed).
    else:
        # AMBIGUITY: "tanks holding fuel" read as volume > 0 at the start.
        active = [t["id"] for t in tanks if rem[t["id"]] > 0]
        while left > EPS and active:
            share = left / len(active)
            for tid in active:
                take = min(share, rem[tid])
                rem[tid] -= take
                left -= take
            active = [tid for tid in active if rem[tid] > EPS]
    return rem, left


def inside(poly, m, a):
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        cross = (a - ax) * (by - ay) - (m - ay) * (bx - ax)
        if (abs(cross) <= EPS
                and min(ax, bx) - EPS <= a <= max(ax, bx) + EPS
                and min(ay, by) - EPS <= m <= max(ay, by) + EPS):
            return True
    odd = False
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        if (ay > m) != (by > m) and a < (bx - ax) * (m - ay) / (by - ay) + ax:
            odd = not odd
    return odd


def mass_balance(ac, cfg, inp):
    w = cfg["weighing"]
    mass, moment = w["mass"], w["moment"]
    exceeded = set()
    loads = inp.get("loads") or {}
    for st in ac["stations"]:
        ld = loads.get(st["id"]) or {}
        m = ld.get("mass", 0.0)
        if "arm" in st:
            arm = st["arm"]
        else:
            pid = ld.get("position") or st["defaultPosition"]
            arm = next(p for p in st["positions"] if p["id"] == pid)["arm"]
        mass += m
        moment += m * arm
        if "maxMass" in st and m > st["maxMass"] + EPS:
            exceeded.add("station:" + st["id"])
    for cl in ac.get("combinedLimits", []):
        s = sum((loads.get(i) or {}).get("mass", 0.0) for i in cl["stations"])
        if s > cl["maxMass"] + EPS:
            exceeded.add("combined:" + cl["id"])
    dry_m, dry_mo = mass, moment

    tanks = ac["tanks"]
    fuel = inp.get("fuel") or {}
    tm, tmo = dry_m, dry_mo
    for t in tanks:
        v = fuel.get(t["id"], 0.0)
        tm += v * t["density"]
        tmo += v * t["density"] * t["arm"]
        if v > t["capacity"] + EPS:
            exceeded.add("tank:" + t["id"])

    # AMBIGUITY: if the input has no burnPlan, fall back to defaultBurnPlan.
    plan = by_id(ac["burnPlans"], inp.get("burnPlan") or ac["defaultBurnPlan"])
    burned = (inp.get("flightTimeHours") or 0.0) * (inp.get("fuelFlow") or 0.0)
    rem, leftover = burn(tanks, {t["id"]: fuel.get(t["id"], 0.0) for t in tanks}, plan, burned)
    if leftover > EPS:  # AMBIGUITY: "burn left over" tested against EPSILON
        exceeded.add("fuelBurn")
    lm, lmo = dry_m, dry_mo
    for t in tanks:
        lm += rem[t["id"]] * t["density"]
        lmo += rem[t["id"]] * t["density"] * t["arm"]

    ml = cfg.get("massLimits") or ac["massLimits"]
    env = cfg.get("envelope") or ac["envelope"]
    mac = ac.get("mac")
    poly = []
    for p in env["points"]:
        a = p["arm"] if "arm" in p else mac["leadingEdgeArm"] + p["percentMac"] / 100 * mac["length"]
        poly.append((a, p["mass"]))
    if tm > ml["maxTakeoff"]["value"] + EPS:
        exceeded.add("takeoffMass")
    if lm > ml["maxLanding"]["value"] + EPS:
        exceeded.add("landingMass")
    # AMBIGUITY: arm for mass 0 is undefined; reported as None.
    tarm = tmo / tm if tm else None
    larm = lmo / lm if lm else None
    if tarm is None or not inside(poly, tm, tarm):
        exceeded.add("takeoffCg")
    if larm is None or not inside(poly, lm, larm):
        exceeded.add("landingCg")
    return tm, tarm, lm, larm, exceeded


# ---------------------------------------------------------------- atmosphere / wind
def atmosphere(inp):
    el, qnh, oat = inp.get("elevation"), inp.get("qnh"), inp.get("oat")
    if el is None or qnh is None:
        return None, None
    elft = el["value"] * LENGTH[el["unit"]] / FT
    pa = elft + 145366.45 * (1 - (qnh / 1013.25) ** 0.190284)
    if oat is None:
        return pa, None
    pr = (1 - pa / 145366.45) ** (1 / 0.190284)
    dr = pr / ((oat + 273.15) / 288.15)
    return pa, 145442.16 * (1 - dr ** 0.234969)


def wind(inp):
    d, s, r = inp.get("windDirection"), inp.get("windSpeed"), inp.get("runwayHeading")
    if d is None or s is None or r is None:
        return None, None
    ang = math.radians(d - r)
    return s * math.cos(ang), abs(s * math.sin(ang))


# ---------------------------------------------------------------- performance
class Ctx:
    def __init__(self, ac, inp, mass, pa, da, hw):
        self.ac, self.inp, self.mass, self.pa, self.da, self.hw = ac, inp, mass, pa, da, hw
        self.warnings = 0

    def input_value(self, name, unit):
        """Value of a named input in `unit`, or None if missing."""
        inp = self.inp
        el = inp.get("elevation")
        if name == "pressureAltitude":
            return None if self.pa is None else conv_len(self.pa, "ft", unit)
        if name == "densityAltitude":
            return None if self.da is None else conv_len(self.da, "ft", unit)
        if name == "elevation":
            return None if el is None else conv_len(el["value"], el["unit"], unit)
        if name == "temperature":
            o = inp.get("oat")
            if o is None:
                return None
            # AMBIGUITY: only C and F are assumed as temperature units.
            return o * 9 / 5 + 32 if unit == "F" else o
        if name == "mass":
            u = self.ac["units"]["mass"]
            return self.mass * (LB if u == "lb" else 1) / (LB if unit == "lb" else 1)
        raise ValueError(name)


def conv_len(v, frm, to):
    return v * LENGTH[frm] / LENGTH[to]


def plan_axis(ctx, ax):
    x = ctx.input_value(ax["input"], ax["unit"])
    if x is None:
        raise Stop("needsInput")
    vals = ax["values"]

    def edge(rule, idx):
        if rule == "none":
            raise Stop("noResult")
        if rule == "nearestWarn":
            ctx.warnings += 1
        return ("idx", idx)

    if x < vals[0] - EPS:
        return edge(ax["below"], 0)
    if x > vals[-1] + EPS:
        return edge(ax["above"], len(vals) - 1)
    for i, v in enumerate(vals):
        if abs(x - v) <= EPS:
            return ("idx", i)
    for i in range(len(vals) - 1):
        if vals[i] < x < vals[i + 1]:
            return ("between", i, (x - vals[i]) / (vals[i + 1] - vals[i]))
    raise Stop("noResult")  # unreachable for rising values


def interp(plans, cell, k=0):
    if k == len(plans):
        return cell
    p = plans[k]
    if p[0] == "idx":
        return interp(plans, cell[p[1]], k + 1)
    lo = interp(plans, cell[p[1]], k + 1)
    hi = interp(plans, cell[p[1] + 1], k + 1)
    return lo + (hi - lo) * p[2]


def run_chain(ac, cond, inp, mass, pa, da, hw):
    ctx = Ctx(ac, inp, mass, pa, da, hw)
    vals = {"total": None, "groundRoll": None}
    has_wind = False
    try:
        for s in cond["steps"]:
            t = s["type"]
            if t == "lookup":
                tb = ac["tables"][s["table"]]
                # AMBIGUITY: axes are resolved in order, and the first failing axis
                # (missing input or out-of-range none) decides the status.
                plans = [plan_axis(ctx, ax) for ax in tb["axes"]]
                for name, cells in tb["outputs"].items():
                    vals[name] = interp(plans, cells)
            elif t == "fixed":
                for n in ("total", "groundRoll"):
                    if n in s:
                        vals[n] = s[n]
            elif t == "factor":
                for n in s["applies"]:
                    if vals[n] is not None:
                        vals[n] *= s["value"]
            elif t == "massCorrection":
                # AMBIGUITY: referenceMass is taken to be in the aircraft's mass unit.
                f = (mass / s["referenceMass"]) ** s["exponent"]
                for n in s["applies"]:
                    if vals[n] is not None:
                        vals[n] *= f
            elif t == "wind":
                has_wind = True
                if hw is None:
                    raise Stop("needsInput")
                rule, knots, sign = None, 0.0, 0
                if hw > EPS and "headwind" in s:
                    rule, knots, sign = s["headwind"], hw, -1
                elif hw < -EPS and "tailwind" in s:
                    rule, knots, sign = s["tailwind"], -hw, 1
                factor = 1.0
                if rule is not None:
                    mk = rule.get("maxKnots")
                    if mk is not None and knots > mk + EPS:
                        # AMBIGUITY: the over-max behaviour is read from the rule's
                        # `above` field; FORMAT.md never names the field.
                        if rule["above"] == "none":
                            raise Stop("noResult")
                        if rule["above"] == "nearestWarn":
                            ctx.warnings += 1
                        knots = mk
                    if rule["mode"] == "proportional":
                        units = knots / rule["perKnots"]
                    else:
                        units = math.floor(knots / rule["perKnots"] + EPS)
                    factor = 1 + sign * rule["percent"] * units / 100
                for n in s["applies"]:
                    if vals[n] is not None:
                        vals[n] *= factor
            elif t == "surface":
                # AMBIGUITY: an unset groundRoll is left untouched.
                if vals["groundRoll"] is not None:
                    added = vals["groundRoll"] * s["percent"] / 100
                    vals["groundRoll"] += added
                    if s["carryToTotal"] and vals["total"] is not None:
                        vals["total"] += added
            elif t == "ratio":
                # AMBIGUITY: an unset `from` leaves `into` unchanged.
                if vals[s["from"]] is not None:
                    vals[s["into"]] = vals[s["from"]] * s["value"]
            else:
                raise ValueError("unknown step " + t)
    except Stop as e:
        return {"status": e.status, "rawTotal": None, "rawGroundRoll": None,
                "total": None, "groundRoll": None, "warnings": 0}

    w = ctx.warnings
    a = cond.get("assumes")
    if a:
        if not a["inputs"]:
            w += 1
        else:
            for i in a["inputs"]:
                v = ctx.input_value(i["input"], i["unit"])
                if v is None or abs(v - i["value"]) > EPS:
                    w += 1  # AMBIGUITY: one warning for the assumption, or one per mismatching input? Counted once below.
                    break
    if not has_wind:
        w += 1
    rnd = lambda v: None if v is None else math.ceil(v - EPS)
    return {"status": "ok", "rawTotal": vals["total"], "rawGroundRoll": vals["groundRoll"],
            "total": rnd(vals["total"]), "groundRoll": rnd(vals["groundRoll"]), "warnings": w}


NONE = {"status": "noData", "rawTotal": None, "rawGroundRoll": None,
        "total": None, "groundRoll": None, "warnings": 0}


def performance(ac, cfg, kind, cond_id, inp, mass, pa, da, hw):
    perf = cfg.get("performance", ac["performance"])
    if perf == "none":
        return dict(NONE)
    cond = by_id(perf[kind], cond_id)
    # AMBIGUITY: an unknown/missing condition id is treated as needsInput.
    if cond is None:
        return dict(NONE, status="needsInput")
    if cond["kind"] == "noData":
        return dict(NONE)
    return run_chain(ac, cond, inp, mass, pa, da, hw)


def calculate(ac, inp):
    cfg = by_id(ac["configurations"], inp["configuration"])
    tm, tarm, lm, larm, exc = mass_balance(ac, cfg, inp)
    pa, da = atmosphere(inp)
    hw, xw = wind(inp)
    # AMBIGUITY: the crosswind warning (crosswind > aircraft.crosswind.value) is not
    # part of either result's warning count or of the output line.
    return {
        "takeoffMass": tm, "takeoffArm": tarm, "landingMass": lm, "landingArm": larm,
        "exceeded": sorted(exc), "pressureAltitudeFt": pa, "densityAltitudeFt": da,
        "headwind": hw, "crosswind": xw,
        "takeoff": performance(ac, cfg, "takeoff", inp.get("takeoffCondition"), inp, tm, pa, da, hw),
        "landing": performance(ac, cfg, "landing", inp.get("landingCondition"), inp, lm, pa, da, hw),
    }


# ---------------------------------------------------------------- check mode
def check(path):
    ac = json.load(open(path))
    md, ad = ac["display"]["massDecimals"], ac["display"]["armDecimals"]
    # Hand cases are compared in the manual's units when the file has them (FORMAT.md).
    mu = ac.get("manualUnits", ac["units"])
    kmass = {"kg": 1.0, "lb": LB}[ac["units"]["mass"]] / {"kg": 1.0, "lb": LB}[mu["mass"]]
    karm = LENGTH[ac["units"]["arm"]] / LENGTH[mu["arm"]]
    back = lambda x, k: float(f"{x * k:.10g}")
    fails = 0
    for hc in ac.get("handCases", []):
        r = calculate(ac, hc["input"])
        ex = hc["expected"]
        bad = []
        for k, d, kf in (("takeoffMass", md, kmass), ("landingMass", md, kmass), ("takeoffArm", ad, karm), ("landingArm", ad, karm)):
            if k in ex:
                # AMBIGUITY: "text with display decimals" taken as fixed-point formatting
                # of both sides; the expected value is formatted the same way.
                got = None if r[k] is None else f"{back(r[k], kf):.{d}f}"
                want = f"{back(ex[k], kf):.{d}f}"
                if got != want:
                    bad.append(f"{k}: got {got}, expected {want}")
        for k in ("takeoff", "landing"):
            for f, v in ex.get(k, {}).items():
                if r[k][f] != v:
                    bad.append(f"{k}.{f}: got {r[k][f]}, expected {v}")
        if sorted(ex.get("exceeded", [])) != r["exceeded"]:
            bad.append(f"exceeded: got {r['exceeded']}, expected {sorted(ex.get('exceeded', []))}")
        if bad:
            fails += 1
            print(f"FAIL {path}: {hc['id']}")
            for b in bad:
                print("   " + b)
    return fails


def main(argv):
    if len(argv) == 3 and argv[1] == "--check":
        n = check(argv[2])
        if not n:
            print(f"ok {argv[2]}")
        return 1 if n else 0
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    ac = json.load(open(argv[1]))
    for line in open(argv[2]):
        if line.strip():
            print(json.dumps(calculate(ac, json.loads(line))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
