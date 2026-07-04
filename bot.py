#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Питомец Канала v5 — PvP-АРЕНА
Игровой цикл: играешь/ухаживаешь → копится заряд арены → при 100% бой
с призраком реального игрока (подбор по трофеям) → XP, трофеи, лиги,
ЖЕТОНЫ 🎟 → эксклюзивная косметика арены. Сезоны по неделям.
Плюс всё из v4: 5 комнат, 4 потребности, сон, 2 мини-игры, квесты, ачивки.
"""

import asyncio, datetime, hashlib, hmac, json, os, random, secrets, sqlite3, time
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

BOT_TOKEN = os.environ.get("BOT_TOKEN") or exit("BOT_TOKEN not set")
WEBAPP_URL = os.environ.get("WEBAPP_URL") or exit("WEBAPP_URL not set")
CHANNEL_ID = os.environ.get("CHANNEL_ID", "")
PORT = int(os.environ.get("PORT", 8080))
DB_PATH = os.environ.get("DB_PATH", "game.db")
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# ---------- ЭКОНОМИКА ----------
DAILY_BONUS = 50
XP_PER_LEVEL = 100
DECAY = {"hunger": 15, "fun": 20, "clean": 10}
SLEEP_REGEN_SEC = 36

GAME_COST_ENERGY = 12
CATCH_MIN_SEC, CATCH_MAX_REWARD, CATCH_RATE = 18, 45, 2.2
SIMON_LEN, SIMON_REWARD_PER, SIMON_MIN_SEC_PER = 12, 6, 0.7
GAME_COOLDOWN = 40

# ---- АРЕНА ----
CHARGE_PER_GAME = 34        # заряд за раунд мини-игры
CHARGE_PER_CARE = 10        # заряд за кормление/мытьё/сон
ARENA_WIN_TROPHY = 20
ARENA_LOSE_TROPHY = 10
ARENA_WIN_TOKENS = 3
ARENA_LOSE_TOKENS = 1
ARENA_WIN_XP = 40
ARENA_LOSE_XP = 12
CARE_BONUS_MAX = 0.15       # до +15% к очкам боя за уход

LEAGUES = [(0,"Деревяшка","🪵"),(100,"Бронза","🥉"),(250,"Серебро","🥈"),
           (500,"Золото","🥇"),(900,"Алмаз","💎"),(1500,"Легенда","🔥")]

FOODS = {
    "snack":  {"name":"Снек","emoji":"🍿","price":5,"hunger":10,"fun":0,"xp":3},
    "burger": {"name":"Бургер","emoji":"🍔","price":10,"hunger":22,"fun":2,"xp":6},
    "pizza":  {"name":"Пицца","emoji":"🍕","price":18,"hunger":40,"fun":6,"xp":12},
    "cake":   {"name":"Торт","emoji":"🎂","price":30,"hunger":55,"fun":15,"xp":20},
}

RANKS = [(1,"Новичок"),(3,"Салага"),(6,"Ловкач"),(10,"Босс"),
         (15,"Легенда"),(21,"Мифический"),(30,"Аватар Канала")]

SHOP = {  # за монеты
    "hat_cap":   {"name":"Кепка","price":150,"emoji":"🧢","slot":"hat"},
    "hat_party": {"name":"Колпак","price":300,"emoji":"🥳","slot":"hat"},
    "hat_halo":  {"name":"Нимб","price":600,"emoji":"😇","slot":"hat"},
    "hat_crown": {"name":"Корона","price":1200,"emoji":"👑","slot":"hat"},
    "gl_cool":   {"name":"Очки","price":250,"emoji":"🕶","slot":"face"},
    "gl_heart":  {"name":"Очки-сердца","price":450,"emoji":"😻","slot":"face"},
    "bg_sunset": {"name":"Закат","price":350,"emoji":"🌇","slot":"bg"},
    "bg_space":  {"name":"Космос","price":550,"emoji":"🌌","slot":"bg"},
    "bg_neon":   {"name":"Неон","price":800,"emoji":"🌈","slot":"bg"},
    "fx_sparkle":{"name":"Аура искр","price":900,"emoji":"✨","slot":"fx"},
}

ARENA_SHOP = {  # ТОЛЬКО за жетоны арены — статусная косметика
    "hat_viking": {"name":"Шлем викинга","price":10,"emoji":"⛑","slot":"hat"},
    "hat_wizard": {"name":"Шляпа мага","price":25,"emoji":"🧙","slot":"hat"},
    "gl_fire":    {"name":"Пылающий взгляд","price":18,"emoji":"🔥","slot":"face"},
    "bg_arena":   {"name":"Колизей","price":30,"emoji":"🏟","slot":"bg"},
    "fx_thunder": {"name":"Аура грозы","price":40,"emoji":"⚡","slot":"fx"},
    "hat_champ":  {"name":"Корона чемпиона","price":60,"emoji":"🏆","slot":"hat"},
}

QUEST_POOL = [
    {"id":"feed3","text":"Покормить 3 раза","type":"feed","goal":3,"reward":40},
    {"id":"game2","text":"Сыграть 2 раунда «Лови еду»","type":"game","goal":2,"reward":60},
    {"id":"simon1","text":"Сыграть раунд «Ритма»","type":"simon","goal":1,"reward":50},
    {"id":"arena1","text":"Провести бой на Арене","type":"arena","goal":1,"reward":60},
    {"id":"arenawin","text":"Победить на Арене","type":"arenawin","goal":1,"reward":100},
    {"id":"shower","text":"Помыть питомца","type":"shower","goal":1,"reward":30},
    {"id":"sleep","text":"Уложить питомца спать","type":"sleep","goal":1,"reward":30},
    {"id":"earn60","text":"Заработать 60 монет","type":"earn","goal":60,"reward":50},
    {"id":"full","text":"Сытость до 100","type":"full","goal":1,"reward":45},
]

ACHIEVEMENTS = {
    "lvl5":{"name":"Пятёрочка","desc":"5 уровень","reward":100},
    "lvl10":{"name":"Десятка","desc":"10 уровень","reward":300},
    "lvl20":{"name":"Двадцатка","desc":"20 уровень","reward":800},
    "streak7":{"name":"Неделя огня","desc":"Стрик 7 дней","reward":200},
    "streak30":{"name":"Месяц огня","desc":"Стрик 30 дней","reward":1000},
    "rich":{"name":"Богач","desc":"2000 монет разом","reward":250},
    "fashion":{"name":"Модник","desc":"4 предмета","reward":150},
    "gamer":{"name":"Геймер","desc":"50 раундов мини-игр","reward":300},
    "score60":{"name":"Снайпер","desc":"60 очков в «Лови еду»","reward":400},
    "maestro":{"name":"Маэстро","desc":"Пройти «Ритм» целиком","reward":500},
    "war5":{"name":"Боец","desc":"5 побед на Арене","reward":200},
    "war25":{"name":"Гладиатор","desc":"25 побед на Арене","reward":600},
    "gold_league":{"name":"Золотая лига","desc":"Достичь Золота","reward":400},
}

# ---------- БАЗА ----------
def db():
    conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS players(
            user_id INTEGER PRIMARY KEY, name TEXT, pet_name TEXT DEFAULT '',
            coins INTEGER DEFAULT 150, tokens INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
            hunger INTEGER DEFAULT 80, energy INTEGER DEFAULT 90,
            fun INTEGER DEFAULT 70, clean INTEGER DEFAULT 90,
            sleeping INTEGER DEFAULT 0, sleep_since REAL DEFAULT 0,
            streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0,
            last_daily INTEGER DEFAULT 0, last_seen REAL DEFAULT 0,
            game_token TEXT DEFAULT '', game_started REAL DEFAULT 0, last_game REAL DEFAULT 0,
            simon_seq TEXT DEFAULT '', simon_started REAL DEFAULT 0, last_simon REAL DEFAULT 0,
            best_score INTEGER DEFAULT 0, best_simon INTEGER DEFAULT 0, total_games INTEGER DEFAULT 0,
            arena_charge INTEGER DEFAULT 60,
            trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
            ghost_score INTEGER DEFAULT 0,
            battle_token TEXT DEFAULT '', battle_started REAL DEFAULT 0, battle_opp TEXT DEFAULT '',
            season INTEGER DEFAULT 0,
            items TEXT DEFAULT '[]', equipped TEXT DEFAULT '{}',
            quests TEXT DEFAULT '{}', ach TEXT DEFAULT '[]'
        );""")

def get_player(uid, name):
    with db() as c:
        row = c.execute("SELECT * FROM players WHERE user_id=?", (uid,)).fetchone()
        if not row:
            c.execute("INSERT INTO players(user_id,name,last_seen,season) VALUES(?,?,?,?)",
                      (uid, name, time.time(), season_n()))
            row = c.execute("SELECT * FROM players WHERE user_id=?", (uid,)).fetchone()
    return dict(row)

def save(p, *fields):
    with db() as c:
        c.execute(f"UPDATE players SET {', '.join(f'{f}=?' for f in fields)} WHERE user_id=?",
                  (*[p[f] for f in fields], p["user_id"]))

def today_n(): return int(time.time() // 86400)
def season_n():
    iso = datetime.date.today().isocalendar()
    return iso[0] * 100 + iso[1]   # ГГГГНН недели

def league_of(trophies):
    idx = 0
    for i, (t, _, _) in enumerate(LEAGUES):
        if trophies >= t: idx = i
    return idx

# ---------- СИМУЛЯЦИЯ ----------
def tick(p):
    now = time.time()
    days = (now - (p["last_seen"] or now)) / 86400
    if days > 0:
        for stat, per_day in DECAY.items():
            p[stat] = max(0, p[stat] - int(days * per_day))
        if not p["sleeping"]:
            p["energy"] = max(0, p["energy"] - int(days * 25))
        if days >= 1 and today_n() - p["last_daily"] > 1:
            p["streak"] = 0
    if p["sleeping"]:
        gained = int((now - p["sleep_since"]) / SLEEP_REGEN_SEC)
        if gained > 0:
            p["energy"] = min(100, p["energy"] + gained)
            p["sleep_since"] = now
        if p["energy"] >= 100:
            p["sleeping"] = 0
    # НОВЫЙ СЕЗОН: трофеи /2, награда жетонами по лиге
    season_reward = 0
    if p["season"] != season_n():
        li = league_of(p["trophies"])
        season_reward = [2, 5, 10, 18, 30, 50][li]
        p["tokens"] += season_reward
        p["trophies"] //= 2
        p["season"] = season_n()
        save(p, "tokens", "trophies", "season")
        p["_season_reward"] = season_reward
    p["last_seen"] = now
    save(p, "hunger","fun","clean","energy","sleeping","sleep_since","streak","last_seen")
    return p

def add_xp(p, amount):
    p["xp"] += amount; lvls = 0
    while p["xp"] >= p["level"] * XP_PER_LEVEL:
        p["xp"] -= p["level"] * XP_PER_LEVEL
        p["level"] += 1; p["coins"] += 25 * p["level"]; lvls += 1
    return lvls

def rank_of(level):
    r = RANKS[0][1]
    for lv, name in RANKS:
        if level >= lv: r = name
    return r

def add_charge(p, amount):
    p["arena_charge"] = min(100, p["arena_charge"] + amount)
    save(p, "arena_charge")

def care_bonus(p):
    avg = (p["hunger"] + p["energy"] + p["fun"] + p["clean"]) / 400
    return 1 + CARE_BONUS_MAX * avg

# ---------- КВЕСТЫ / АЧИВКИ ----------
def ensure_quests(p):
    q = json.loads(p["quests"] or "{}")
    if q.get("day") != today_n():
        picks = random.sample(QUEST_POOL, 3)
        q = {"day": today_n(),
             "list": [{"id":x["id"],"progress":0,"done":False,"claimed":False} for x in picks]}
        p["quests"] = json.dumps(q); save(p, "quests")
    return q

def quest_def(qid): return next(x for x in QUEST_POOL if x["id"] == qid)

def bump_quest(p, qtype, amount=1):
    q = ensure_quests(p); changed = False
    for item in q["list"]:
        d = quest_def(item["id"])
        if d["type"] == qtype and not item["done"]:
            item["progress"] = min(d["goal"], item["progress"] + amount)
            if item["progress"] >= d["goal"]: item["done"] = True
            changed = True
    if changed:
        p["quests"] = json.dumps(q); save(p, "quests")

def check_achievements(p):
    got = json.loads(p["ach"]); new = []
    def unlock(k):
        if k not in got:
            got.append(k); p["coins"] += ACHIEVEMENTS[k]["reward"]; new.append(k)
    if p["level"] >= 5: unlock("lvl5")
    if p["level"] >= 10: unlock("lvl10")
    if p["level"] >= 20: unlock("lvl20")
    if p["best_streak"] >= 7: unlock("streak7")
    if p["best_streak"] >= 30: unlock("streak30")
    if p["coins"] >= 2000: unlock("rich")
    if len(json.loads(p["items"])) >= 4: unlock("fashion")
    if p["total_games"] >= 50: unlock("gamer")
    if p["best_score"] >= 60: unlock("score60")
    if p["best_simon"] >= SIMON_LEN: unlock("maestro")
    if p["wins"] >= 5: unlock("war5")
    if p["wins"] >= 25: unlock("war25")
    if league_of(p["trophies"]) >= 3: unlock("gold_league")
    if new:
        p["ach"] = json.dumps(got); save(p, "ach", "coins")
    return new

def public_state(p, extra=None):
    q = ensure_quests(p)
    quests = [{**item, "text": quest_def(item["id"])["text"],
               "goal": quest_def(item["id"])["goal"],
               "reward": quest_def(item["id"])["reward"]} for item in q["list"]]
    now = time.time()
    li = league_of(p["trophies"])
    st = {
        "pet_name": p["pet_name"], "coins": p["coins"], "tokens": p["tokens"],
        "xp": p["xp"], "xp_need": p["level"]*XP_PER_LEVEL, "level": p["level"],
        "rank": rank_of(p["level"]),
        "hunger": p["hunger"], "energy": p["energy"], "fun": p["fun"], "clean": p["clean"],
        "sleeping": bool(p["sleeping"]),
        "streak": p["streak"], "best_streak": p["best_streak"],
        "best_score": p["best_score"], "best_simon": p["best_simon"],
        "arena_charge": p["arena_charge"], "trophies": p["trophies"],
        "wins": p["wins"], "losses": p["losses"],
        "league": {"i": li, "name": LEAGUES[li][1], "emoji": LEAGUES[li][2],
                   "next": LEAGUES[li+1][0] if li+1 < len(LEAGUES) else None},
        "care_bonus": round((care_bonus(p)-1)*100),
        "items": json.loads(p["items"]), "equipped": json.loads(p["equipped"]),
        "daily_available": today_n() > p["last_daily"],
        "quests": quests, "ach_got": json.loads(p["ach"]), "ach_all": ACHIEVEMENTS,
        "shop": SHOP, "arena_shop": ARENA_SHOP, "foods": FOODS, "simon_len": SIMON_LEN,
        "game_cd": max(0, int(GAME_COOLDOWN - (now - p["last_game"]))),
        "simon_cd": max(0, int(GAME_COOLDOWN - (now - p["last_simon"]))),
    }
    if p.pop("_season_reward", None):
        st["season_reward"] = True
    if extra: st.update(extra)
    return st

# ---------- АВТОРИЗАЦИЯ ----------
def check_init_data(init_data):
    try:
        data = dict(parse_qsl(init_data, keep_blank_values=True))
        given = data.pop("hash", "")
        cs = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calc = hmac.new(secret, cs.encode(), hashlib.sha256).hexdigest()
        return json.loads(data.get("user", "{}")) if hmac.compare_digest(calc, given) else None
    except Exception:
        return None

async def auth(request):
    body = await request.json()
    user = check_init_data(body.get("initData", ""))
    if not user or "id" not in user:
        raise web.HTTPUnauthorized(text="bad initData")
    p = tick(get_player(user["id"], user.get("first_name", "Игрок")))
    request["body"] = body
    return p

def ok(p, **extra): return web.json_response(public_state(p, extra))
def err(msg): return web.json_response({"error": msg}, status=400)
def awake_required(p):
    return err("Питомец спит! Разбуди его в спальне 🌙") if p["sleeping"] else None

def game_gate(p, last_field):
    blocked = awake_required(p)
    if blocked: return blocked
    cd = GAME_COOLDOWN - (time.time() - p[last_field])
    if cd > 0: return err(f"Питомец отдыхает ещё {int(cd)} c")
    if p["energy"] < GAME_COST_ENERGY: return err("Мало энергии — уложи питомца спать 🌙")
    if p["hunger"] < 10: return err("Питомец голодный — сначала покорми!")
    return None

def apply_game_cost(p):
    p["energy"] = max(0, p["energy"] - GAME_COST_ENERGY)
    p["fun"] = min(100, p["fun"] + 12)
    p["hunger"] = max(0, p["hunger"] - 3)
    p["total_games"] += 1

# ---------- API: базовое ----------
async def api_state(request): return ok(await auth(request))

async def api_setname(request):
    p = await auth(request)
    name = str(request["body"].get("name","")).strip()[:16]
    if len(name) < 2: return err("Имя от 2 символов")
    p["pet_name"] = name; save(p, "pet_name"); return ok(p)

async def api_daily(request):
    p = await auth(request)
    if today_n() <= p["last_daily"]: return err("Уже получено — приходи завтра!")
    p["streak"] = p["streak"] + 1 if today_n() - p["last_daily"] == 1 else 1
    p["best_streak"] = max(p["best_streak"], p["streak"])
    bonus = DAILY_BONUS + min(p["streak"], 10) * 5
    p["coins"] += bonus; p["last_daily"] = today_n()
    save(p, "coins","streak","best_streak","last_daily")
    return ok(p, bonus=bonus, new_ach=check_achievements(p))

async def api_feed(request):
    p = await auth(request)
    blocked = awake_required(p)
    if blocked: return blocked
    food = FOODS.get(request["body"].get("food",""))
    if not food: return err("Нет такой еды")
    if p["coins"] < food["price"]: return err("Не хватает монет — сыграй в мини-игру!")
    if p["hunger"] >= 100: return err("Питомец объелся!")
    p["coins"] -= food["price"]
    p["hunger"] = min(100, p["hunger"] + food["hunger"])
    p["fun"] = min(100, p["fun"] + food["fun"])
    lvls = add_xp(p, food["xp"])
    save(p, "coins","hunger","fun","xp","level")
    add_charge(p, CHARGE_PER_CARE)
    bump_quest(p, "feed")
    if p["hunger"] >= 100: bump_quest(p, "full")
    return ok(p, levelup=lvls, new_ach=check_achievements(p))

async def api_shower(request):
    p = await auth(request)
    blocked = awake_required(p)
    if blocked: return blocked
    if p["clean"] >= 100: return err("Питомец уже чистюля!")
    p["clean"] = 100; p["fun"] = min(100, p["fun"] + 5)
    lvls = add_xp(p, 5)
    save(p, "clean","fun","xp","level")
    add_charge(p, CHARGE_PER_CARE)
    bump_quest(p, "shower")
    return ok(p, levelup=lvls, new_ach=check_achievements(p))

async def api_sleep(request):
    p = await auth(request)
    if p["sleeping"]:
        p["sleeping"] = 0; save(p, "sleeping")
        return ok(p, woke=True)
    if p["energy"] >= 95: return err("Питомец не хочет спать — он полон сил!")
    p["sleeping"] = 1; p["sleep_since"] = time.time()
    save(p, "sleeping","sleep_since")
    add_charge(p, CHARGE_PER_CARE)
    bump_quest(p, "sleep")
    return ok(p)

# ---------- API: мини-игры ----------
async def api_game_start(request):
    p = await auth(request)
    blocked = game_gate(p, "last_game")
    if blocked: return blocked
    p["game_token"] = secrets.token_hex(8); p["game_started"] = time.time()
    save(p, "game_token","game_started")
    return ok(p, token=p["game_token"])

async def api_game_finish(request):
    p = await auth(request); body = request["body"]
    if not p["game_token"] or body.get("token") != p["game_token"]:
        return err("Раунд не был начат")
    elapsed = time.time() - p["game_started"]
    p["game_token"] = ""
    score = max(0, int(body.get("score", 0)))
    if elapsed < CATCH_MIN_SEC:
        save(p, "game_token"); return err("Раунд не засчитан")
    reward = min(CATCH_MAX_REWARD, score)
    p["coins"] += reward; p["last_game"] = time.time()
    p["best_score"] = max(p["best_score"], score)
    p["ghost_score"] = score          # свежий призрак для чужих боёв
    apply_game_cost(p)
    lvls = add_xp(p, 10 + score // 5)
    save(p, "game_token","coins","energy","fun","hunger","last_game",
         "total_games","best_score","ghost_score","xp","level")
    add_charge(p, CHARGE_PER_GAME)
    bump_quest(p, "game"); bump_quest(p, "earn", reward)
    return ok(p, reward=reward, score=score, levelup=lvls, new_ach=check_achievements(p))

async def api_simon_start(request):
    p = await auth(request)
    blocked = game_gate(p, "last_simon")
    if blocked: return blocked
    seq = [random.randrange(4) for _ in range(SIMON_LEN)]
    p["simon_seq"] = json.dumps(seq); p["simon_started"] = time.time()
    save(p, "simon_seq","simon_started")
    return ok(p, seq=seq)

async def api_simon_finish(request):
    p = await auth(request); body = request["body"]
    if not p["simon_seq"]: return err("Раунд не был начат")
    seq = json.loads(p["simon_seq"]); p["simon_seq"] = ""
    elapsed = time.time() - p["simon_started"]
    reached = max(0, min(len(seq), int(body.get("reached", 0))))
    if reached > 0 and elapsed < reached * SIMON_MIN_SEC_PER:
        save(p, "simon_seq"); return err("Раунд не засчитан")
    reward = reached * SIMON_REWARD_PER
    p["coins"] += reward; p["last_simon"] = time.time()
    p["best_simon"] = max(p["best_simon"], reached)
    apply_game_cost(p)
    lvls = add_xp(p, 8 + reached * 3)
    save(p, "simon_seq","coins","energy","fun","hunger","last_simon",
         "total_games","best_simon","xp","level")
    add_charge(p, CHARGE_PER_GAME)
    bump_quest(p, "simon"); bump_quest(p, "earn", reward)
    return ok(p, reward=reward, reached=reached, levelup=lvls, new_ach=check_achievements(p))

# ---------- API: АРЕНА ----------
def find_opponent(p):
    """Ближайший по трофеям игрок с призраком. Если никого — тренировочный бот."""
    with db() as c:
        row = c.execute(
            "SELECT user_id,name,pet_name,level,trophies,ghost_score,equipped "
            "FROM players WHERE user_id!=? AND pet_name!='' AND ghost_score>0 "
            "ORDER BY ABS(trophies-?) LIMIT 5",
            (p["user_id"], p["trophies"])).fetchall()
    if row:
        o = dict(random.choice(row))
        o["bot"] = False
        return o
    base = max(15, p["best_score"] or 20)
    return {"user_id": 0, "name": "Тренер", "pet_name": "Дикий Жмых",
            "level": max(1, p["level"]), "trophies": p["trophies"],
            "ghost_score": base + random.randint(-5, 8),
            "equipped": "{}", "bot": True}

async def api_battle_start(request):
    p = await auth(request)
    blocked = awake_required(p)
    if blocked: return blocked
    if p["arena_charge"] < 100:
        return err(f"Арена заряжена на {p['arena_charge']}% — играй и ухаживай!")
    if p["energy"] < GAME_COST_ENERGY:
        return err("Мало энергии для боя — уложи питомца спать 🌙")
    opp = find_opponent(p)
    p["battle_token"] = secrets.token_hex(8)
    p["battle_started"] = time.time()
    p["battle_opp"] = json.dumps({"score": opp["ghost_score"], "uid": opp["user_id"]})
    save(p, "battle_token","battle_started","battle_opp")
    return ok(p, token=p["battle_token"],
              opponent={"name": opp["name"], "pet_name": opp["pet_name"],
                        "level": opp["level"], "trophies": opp["trophies"],
                        "league": LEAGUES[league_of(opp["trophies"])][1],
                        "league_emoji": LEAGUES[league_of(opp["trophies"])][2],
                        "equipped": json.loads(opp["equipped"] or "{}")},
              my_bonus=round((care_bonus(p)-1)*100))

async def api_battle_finish(request):
    p = await auth(request); body = request["body"]
    if not p["battle_token"] or body.get("token") != p["battle_token"]:
        return err("Бой не был начат")
    opp = json.loads(p["battle_opp"] or "{}")
    p["battle_token"] = ""
    raw = max(0, int(body.get("score", 0)))
    my_final = int(raw * care_bonus(p))
    opp_score = int(opp.get("score", 20))
    win = my_final > opp_score
    draw = my_final == opp_score
    if win:
        p["trophies"] += ARENA_WIN_TROPHY
        p["tokens"] += ARENA_WIN_TOKENS
        p["wins"] += 1
        xp_gain = ARENA_WIN_XP
    elif draw:
        p["tokens"] += ARENA_LOSE_TOKENS
        xp_gain = ARENA_LOSE_XP
    else:
        p["trophies"] = max(0, p["trophies"] - ARENA_LOSE_TROPHY)
        p["tokens"] += ARENA_LOSE_TOKENS
        p["losses"] += 1
        xp_gain = ARENA_LOSE_XP
    p["arena_charge"] = 0
    p["ghost_score"] = raw
    apply_game_cost(p)
    lvls = add_xp(p, xp_gain)
    save(p, "battle_token","trophies","tokens","wins","losses","arena_charge",
         "ghost_score","energy","fun","hunger","total_games","xp","level","coins")
    bump_quest(p, "arena")
    if win: bump_quest(p, "arenawin")
    return ok(p, result="win" if win else "draw" if draw else "lose",
              my_raw=raw, my_final=my_final, opp_score=opp_score,
              d_trophy=ARENA_WIN_TROPHY if win else 0 if draw else -ARENA_LOSE_TROPHY,
              d_tokens=ARENA_WIN_TOKENS if win else ARENA_LOSE_TOKENS,
              xp_gain=xp_gain, levelup=lvls, new_ach=check_achievements(p))

async def api_arena_buy(request):
    p = await auth(request)
    iid = request["body"].get("item",""); it = ARENA_SHOP.get(iid)
    items = json.loads(p["items"])
    if not it: return err("Нет такого предмета")
    if iid in items: return err("Уже куплено")
    if p["tokens"] < it["price"]: return err("Не хватает жетонов — сражайся на Арене!")
    p["tokens"] -= it["price"]; items.append(iid)
    eq = json.loads(p["equipped"]); eq[it["slot"]] = iid
    p["items"] = json.dumps(items); p["equipped"] = json.dumps(eq)
    save(p, "tokens","items","equipped")
    return ok(p, new_ach=check_achievements(p))

# ---------- API: прочее ----------
async def api_claim_quest(request):
    p = await auth(request)
    qid = request["body"].get("id","")
    q = ensure_quests(p)
    for item in q["list"]:
        if item["id"] == qid:
            if not item["done"]: return err("Квест ещё не выполнен")
            if item["claimed"]: return err("Награда уже получена")
            item["claimed"] = True
            reward = quest_def(qid)["reward"]
            p["coins"] += reward; p["quests"] = json.dumps(q)
            save(p, "coins","quests")
            return ok(p, reward=reward)
    return err("Нет такого квеста")

async def api_buy(request):
    p = await auth(request)
    iid = request["body"].get("item",""); it = SHOP.get(iid)
    items = json.loads(p["items"])
    if not it: return err("Нет такого предмета")
    if iid in items: return err("Уже куплено")
    if p["coins"] < it["price"]: return err("Не хватает монет")
    p["coins"] -= it["price"]; items.append(iid)
    eq = json.loads(p["equipped"]); eq[it["slot"]] = iid
    p["items"] = json.dumps(items); p["equipped"] = json.dumps(eq)
    save(p, "coins","items","equipped")
    return ok(p, new_ach=check_achievements(p))

async def api_equip(request):
    p = await auth(request)
    iid = request["body"].get("item","")
    it = SHOP.get(iid) or ARENA_SHOP.get(iid)
    if not it or iid not in json.loads(p["items"]): return err("Предмет не куплен")
    eq = json.loads(p["equipped"])
    eq[it["slot"]] = None if eq.get(it["slot"]) == iid else iid
    p["equipped"] = json.dumps(eq); save(p, "equipped")
    return ok(p)

async def api_top(request):
    await auth(request)
    with db() as c:
        rows = c.execute("SELECT name,pet_name,level,trophies,wins,streak "
                         "FROM players WHERE pet_name!='' "
                         "ORDER BY trophies DESC, level DESC LIMIT 25").fetchall()
    out = []
    for r in rows:
        d = dict(r); li = league_of(d["trophies"])
        d["league_emoji"] = LEAGUES[li][2]
        out.append(d)
    return web.json_response({"top": out})

async def index(request):
    return web.FileResponse(os.path.join(STATIC, "index.html"))

# ---------- БОТ ----------
bot = Bot(BOT_TOKEN)
dp = Dispatcher()

@dp.message(CommandStart())
async def start(message: types.Message):
    if CHANNEL_ID:
        try:
            m = await bot.get_chat_member(CHANNEL_ID, message.from_user.id)
            if m.status in ("left", "kicked"):
                await message.answer(f"Сначала подпишись на {CHANNEL_ID} 😉"); return
        except Exception:
            pass
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="⚔️ Открыть игру", web_app=WebAppInfo(url=WEBAPP_URL))]])
    await message.answer(
        "Твой питомец ждёт! Прокачивай его и сражайся с другими подписчиками на Арене ⚔️🏆",
        reply_markup=kb)

async def main():
    init_db()
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_static("/static", STATIC)
    for name in ("state","setname","daily","feed","shower","sleep",
                 "game_start","game_finish","simon_start","simon_finish",
                 "battle_start","battle_finish","arena_buy",
                 "claim_quest","buy","equip","top"):
        app.router.add_post(f"/api/{name}", globals()[f"api_{name}"])
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    print(f"Мини-апп на порту {PORT}")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
