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

# ---- Шахта Удачи (казино-слот) ----
MINE_BETS = (10, 25, 50, 100, 200)
MINE_COOLDOWN = 3                       # секунд между спинами (анти-спам)
MINE_COLS, MINE_ROWS = 5, 5
MINE_INV_ROWS = 3                       # инвентарь кирок 3×5 над полем
# слот инвентаря: пусто / блокер / кирка (дерево..алмаз), вес выпадения
MINE_SPAWN = [("",44), ("x",10), ("w",22), ("s",12), ("i",7), ("g",4), ("d",1)]
MINE_TIERS = {"w":1, "s":2, "i":3, "g":4, "d":5}      # урон кирки по рангу
MINE_TIER_UP = {"w":"s", "s":"i", "i":"g", "g":"d"}   # 2 одинаковые → ранг выше
# тип блока, вес выпадения, множитель ставки за добычу
MINE_BLOCKS = [("dirt",50,0), ("stone",29,0), ("coal",10,.05),
               ("iron",6,.15), ("gold",3,.4), ("diam",2,.9)]
MINE_CHEST_BONUS = .5                   # колонна прокопана до дна
# подобрано Монте-Карло: средний возврат ~93% ставки
FISHING_MIN_SEC, FISHING_MAX_REWARD, FISHING_RATE = 15, 40, 1.8

# ---- АЛХИМИК (2048-merge) ----
ALCHEMY_SIZE = 4
ALCHEMY_RANKS = ["Капля","Роса","Кристалл","Осколок","Сфера","Сердце",
                 "Звезда","Сияние","Мифический","Вечный","Легенда"]
ALCHEMY_COIN_PER = 2          # монет за единицу ранга, добытого слиянием
ALCHEMY_DAILY_CAP = 60        # потолок монет/день из Алхимика
ALCHEMY_TALISMAN_RANK = 9     # с этого ранга — в коллекцию + талисман
ALCHEMY_TALISMAN_CHANCE = 0.08  # шанс спавна плитки ранга 2 вместо 1
ALCHEMY_BOOST = 1.5           # множитель буста к шахте
ALCHEMY_MOVE_CD = 0.12        # антиспам между ходами, сек
ALCHEMY_TAL_TTL = 86400       # талисман живёт 24ч после получения
# Алхимические символы плиток (для клиента; порядок = ранги 1..11)
ALCHEMY_SYMS = ["💧","🫧","❄️","🔷","🔮","🩸","✨","🌟","⚗️","🧪","💠"]

# ---- ПОДЗЕМЕЛЬЕ (roguelite-забег) ----
DUNGEON_MAX_HP = 100
DUNGEON_MAX_FLOOR = 50
DUNGEON_COST_ENERGY = 15     # энергии за старт забега
DUNGEON_REWARD_COIN = 20     # монет за пройденный этаж
DUNGEON_BOSS_EVERY = 5       # босс каждые N этажей
DUNGEON_MONSTERS = ["🦇","🕷️","🐀","💀","👹","🧟","🐍","👺","🦂","👻"]
DUNGEON_BOSSES = ["🐉","👾","🦖","😈","🧌"]
# метапрогресс: апгрейды за токены (cost — список цен по уровням 1..max)
DUNGEON_UPGRADES = {
    "hp":    {"name":"Жизни","desc":"+20 к макс. HP","max":5,"cost":[50,120,250,500,1000]},
    "power": {"name":"Сила","desc":"+3 урона за удар","max":5,"cost":[50,120,250,500,1000]},
    "crit":  {"name":"Крит","desc":"+6% шанс крита x2","max":5,"cost":[80,180,350,700,1400]},
    "regen": {"name":"Реген","desc":"+4 HP после этажа","max":5,"cost":[80,180,350,700,1400]},
}
DUNGEON_LOOT = [  # базовый лут: (ключ, шанс, эмодзи, имя)
    ("ingr", 0.55, "🧪", "Ингредиент"),
    ("coin", 0.30, "🪙", "Монеты"),
    ("skin", 0.10, "🎽", "Скин"),
    ("token",0.05, "🎟️", "Токен"),
]

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
    # Наряды героини: каждый — отдельная VRM-модель static/models/<vrm>.vrm.
    # Базовый вид (heroine.vrm) — когда слот outfit пуст.
    "fit_shorts": {"name":"Шорты",      "price":0,    "emoji":"🩳","slot":"outfit","vrm":"heroine_shorts"},
    "fit_pants1": {"name":"Брюки",      "price":350,  "emoji":"👖","slot":"outfit","vrm":"heroine_pantsv1"},
    "fit_skirt1": {"name":"Юбка",       "price":500,  "emoji":"👗","slot":"outfit","vrm":"heroine_skirtv1"},
    "fit_pants2": {"name":"Брюки Люкс", "price":800,  "emoji":"🧥","slot":"outfit","vrm":"heroine_pantsv2"},
    "fit_skirt2": {"name":"Юбка Люкс",  "price":1200, "emoji":"💃","slot":"outfit","vrm":"heroine_skirtv2"},
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
    {"id":"dg3","text":"Спустись на 3 этажа Подземелья","type":"dungeonfloor","goal":3,"reward":70},
    {"id":"dg10","text":"Спустись на 10 этажей Подземелья","type":"dungeonfloor","goal":10,"reward":200},
    {"id":"dg5","text":"Заверши 5 забегов в Подземелье","type":"dungeon","goal":5,"reward":250},
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
    "delver5":{"name":"Искатель","desc":"5 этаж Подземелья","reward":120},
    "delver20":{"name":"Глубокий спуск","desc":"20 этаж Подземелья","reward":500},
    "boss1":{"name":"Убийца боссов","desc":"Победить босса","reward":300},
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
            fishing_started REAL DEFAULT 0, last_fishing REAL DEFAULT 0,
            best_score INTEGER DEFAULT 0, best_simon INTEGER DEFAULT 0, best_fishing INTEGER DEFAULT 0, total_games INTEGER DEFAULT 0,
            arena_charge INTEGER DEFAULT 60,
            trophies INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
            ghost_score INTEGER DEFAULT 0,
            battle_token TEXT DEFAULT '', battle_started REAL DEFAULT 0, battle_opp TEXT DEFAULT '',
            season INTEGER DEFAULT 0,
            items TEXT DEFAULT '[]', equipped TEXT DEFAULT '{}',
            quests TEXT DEFAULT '{}', ach TEXT DEFAULT '[]'
        );
        """)
        # migration: add fishing columns if missing
        for col in ("fishing_started", "last_fishing", "best_fishing"):
            coltype = "INTEGER DEFAULT 0" if col == "best_fishing" else "REAL DEFAULT 0"
            try: c.execute(f"ALTER TABLE players ADD COLUMN {col} {coltype}")
            except: pass
        # migration: add mine slot columns if missing
        for col, coltype in (("last_mine", "REAL DEFAULT 0"),
                              ("best_mine", "INTEGER DEFAULT 0")):
            try: c.execute(f"ALTER TABLE players ADD COLUMN {col} {coltype}")
            except: pass
        # migration: add alchemist columns if missing
        for col, coltype in (
            ("alchemy_board",    "TEXT DEFAULT '[]'"),
            ("alchemy_moves",    "INTEGER DEFAULT 20"),
            ("alchemy_day",      "INTEGER DEFAULT 0"),
            ("alchemy_day_coins","INTEGER DEFAULT 0"),
            ("alchemy_streak",   "INTEGER DEFAULT 0"),
            ("alchemy_last_day", "INTEGER DEFAULT 0"),
            ("alchemy_last_play","INTEGER DEFAULT 0"),
            ("alchemy_last_move","REAL DEFAULT 0"),
            ("alchemy_best",     "INTEGER DEFAULT 0"),
            ("alchemy_items",    "TEXT DEFAULT '[]'"),
            ("alchemy_talismans","TEXT DEFAULT '[]'"),
            ("alchemy_tal_day",  "INTEGER DEFAULT 0"),
            ("mine_boost",       "REAL DEFAULT 0")):
            try: c.execute(f"ALTER TABLE players ADD COLUMN {col} {coltype}")
            except: pass
        # migration: add dungeon columns if missing
        for col, coltype in (
            ("dungeon_token",     "TEXT DEFAULT ''"),
            ("dungeon_started",   "REAL DEFAULT 0"),
            ("dungeon_floor",     "INTEGER DEFAULT 0"),
            ("dungeon_hp",        "INTEGER DEFAULT 0"),
            ("dungeon_seed",      "TEXT DEFAULT ''"),
            ("dungeon_deepest",   "INTEGER DEFAULT 0"),
            ("dungeon_upgrades",  "TEXT DEFAULT '{}'"),
            ("dungeon_last_day",  "INTEGER DEFAULT 0"),
            ("dungeon_ingr",      "INTEGER DEFAULT 0"),
            ("dungeon_bosses",    "INTEGER DEFAULT 0")):
            try: c.execute(f"ALTER TABLE players ADD COLUMN {col} {coltype}")
            except: pass

def get_player(uid, name):
    with db() as c:
        row = c.execute("SELECT * FROM players WHERE user_id=?", (uid,)).fetchone()
        if not row:
            c.execute("INSERT INTO players(user_id,name,last_seen,season) VALUES(?,?,?,?)",
                      (uid, name, time.time(), season_n()))
            row = c.execute("SELECT * FROM players WHERE user_id=?", (uid,)).fetchone()
    p = dict(row)
    # стартовая доска Алхимика — две плитки ранга 1
    try:
        if not p["alchemy_board"] or json.loads(p["alchemy_board"]) == []:
            nb = [[0]*ALCHEMY_SIZE for _ in range(ALCHEMY_SIZE)]
            for _ in range(2):
                empties = [(r, cc) for r in range(ALCHEMY_SIZE)
                           for cc in range(ALCHEMY_SIZE) if nb[r][cc] == 0]
                r, cc = random.choice(empties); nb[r][cc] = 1
            p["alchemy_board"] = json.dumps(nb)
            with db() as c:
                c.execute("UPDATE players SET alchemy_board=? WHERE user_id=?",
                          (p["alchemy_board"], uid))
    except Exception:
        pass
    return p

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
    # НОВЫЙ ДЕНЬ: восстановление ходов Алхимика + сброс дневного капа монет
    ad = today_n()
    if p["alchemy_last_day"] != ad:
        p["alchemy_moves"] = 0          # счётчик ходов, сделанных за день
        p["alchemy_day_coins"] = 0
        p["alchemy_day"] = ad
        p["alchemy_last_day"] = ad
        save(p, "alchemy_moves","alchemy_day_coins","alchemy_day","alchemy_last_day")
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
    if p["dungeon_deepest"] >= 5: unlock("delver5")
    if p["dungeon_deepest"] >= 20: unlock("delver20")
    if p["dungeon_bosses"] >= 1: unlock("boss1")
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
        "best_score": p["best_score"], "best_simon": p["best_simon"], "best_fishing": p.get("best_fishing", 0),
        "best_mine": p.get("best_mine", 0),
        "arena_charge": p["arena_charge"], "trophies": p["trophies"],
        "wins": p["wins"], "losses": p["losses"],
        "league": {"i": li, "name": LEAGUES[li][1], "emoji": LEAGUES[li][2],
                   "next": LEAGUES[li+1][0] if li+1 < len(LEAGUES) else None},
        "care_bonus": round((care_bonus(p)-1)*100),
        "items": json.loads(p["items"]), "equipped": json.loads(p["equipped"]),
        "daily_available": today_n() > p["last_daily"],
        "quests": quests, "ach_got": json.loads(p["ach"]), "ach_all": ACHIEVEMENTS,
        "shop": SHOP, "arena_shop": ARENA_SHOP, "foods": FOODS, "simon_len": SIMON_LEN,
        "alchemy": {
            "moves": p["alchemy_moves"], "best": p["alchemy_best"],
            "streak": p["alchemy_streak"], "day_coins": p["alchemy_day_coins"],
            "daily_cap": ALCHEMY_DAILY_CAP, "coin_per": ALCHEMY_COIN_PER,
            "board": json.loads(p["alchemy_board"]),
            "items": json.loads(p["alchemy_items"]),
            "talismans": alchemy_active_talismans(p, now),
            "ranks": ALCHEMY_RANKS, "syms": ALCHEMY_SYMS,
            "tal_rank": ALCHEMY_TALISMAN_RANK,
            "locked": p["alchemy_tal_day"] == today_n(),
            "boost": ALCHEMY_BOOST, "tal_ttl": ALCHEMY_TAL_TTL,
            "boost_ready": p["mine_boost"] > 0,
        },
        "dungeon": {
            "in_run": bool(p["dungeon_floor"]),
            "floor": p["dungeon_floor"], "hp": p["dungeon_hp"],
            "max_hp": DUNGEON_MAX_HP,
            "deepest": p["dungeon_deepest"],
            "upgrades": json.loads(p["dungeon_upgrades"]),
            "ingr": p["dungeon_ingr"],
            "bosses": p["dungeon_bosses"],
            "cost_energy": DUNGEON_COST_ENERGY,
            "boss_every": DUNGEON_BOSS_EVERY,
            "max_floor": DUNGEON_MAX_FLOOR,
            "upgrade_defs": DUNGEON_UPGRADES,
        },
        "game_cd": max(0, int(GAME_COOLDOWN - (now - p["last_game"]))),
        "simon_cd": max(0, int(GAME_COOLDOWN - (now - p["last_simon"]))),
        "fishing_cd": max(0, int(GAME_COOLDOWN - (now - p.get("last_fishing", 0)))),
    }
    if p.pop("_season_reward", None):
        st["season_reward"] = True
    if extra: st.update(extra)
    return st

# ---------- АВТОРИЗАЦИЯ ----------
# initData старше 1 суток отклоняем: защита от replay-атак перехваченным
# initData (HMAC валиден бессрочно, а user_id в нём постоянный — без этого
# лимита перехваченный 30 дней назад чек остаётся годным для трофеев).
_INITDATA_MAX_AGE = 86400

def check_init_data(init_data):
    try:
        data = dict(parse_qsl(init_data, keep_blank_values=True))
        given = data.pop("hash", "")
        auth_date = int(data.get("auth_date", "0"))
        if not auth_date or time.time() - auth_date > _INITDATA_MAX_AGE:
            return None
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

# ---------- API: рыбалка ----------
async def api_fishing_start(request):
    p = await auth(request)
    blocked = game_gate(p, "last_fishing")
    if blocked: return blocked
    p["fishing_started"] = time.time()
    save(p, "fishing_started")
    return ok(p)

async def api_fishing_finish(request):
    p = await auth(request); body = request["body"]
    if not p.get("fishing_started"):
        return err("Рыбалка не была начата")
    elapsed = time.time() - p["fishing_started"]
    p["fishing_started"] = 0
    score = max(0, int(body.get("score", 0)))
    if elapsed < FISHING_MIN_SEC:
        save(p, "fishing_started"); return err("Рыбалка не засчитана")
    reward = min(FISHING_MAX_REWARD, score)
    p["coins"] += reward; p["last_fishing"] = time.time()
    p["best_fishing"] = max(p.get("best_fishing", 0), score)
    apply_game_cost(p)
    lvls = add_xp(p, 10 + score // 4)
    save(p, "fishing_started","coins","energy","fun","hunger","last_fishing",
         "total_games","best_fishing","xp","level")
    add_charge(p, CHARGE_PER_GAME)
    bump_quest(p, "game"); bump_quest(p, "earn", reward)
    return ok(p, reward=reward, score=score, levelup=lvls, new_ach=check_achievements(p))

async def api_mine_spin(request):
    """Шахта Удачи: в инвентаре 3×5 спавнятся кирки пяти рангов (и блокеры),
    в каждой колонке две одинаковые сливаются в ранг выше, суммарный урон
    колонки копает блоки. Вся математика здесь; клиент только анимирует."""
    p = await auth(request); body = request["body"]
    bet = int(body.get("bet", 0))
    if bet not in MINE_BETS: return err("Некорректная ставка")
    if p["coins"] < bet: return err("Не хватает монет")
    now = time.time()
    if now - p.get("last_mine", 0) < MINE_COOLDOWN:
        return err("Шахта осыпается — подожди пару секунд")

    # 1. спавн инвентаря: grid[col][row] сверху вниз
    tokens = [t[0] for t in MINE_SPAWN]
    tw     = [t[1] for t in MINE_SPAWN]
    grid = [random.choices(tokens, weights=tw, k=MINE_INV_ROWS)
            for _ in range(MINE_COLS)]

    # 2. слияния и урон колонок
    digs, chests = [], []
    for c in range(MINE_COLS):
        picks = [t for t in grid[c] if t in MINE_TIERS]
        merged = True
        while merged:
            merged = False
            for t in "wsig":                      # алмаз выше не сливается
                if picks.count(t) >= 2:
                    picks.remove(t); picks.remove(t)
                    picks.append(MINE_TIER_UP[t])
                    merged = True
                    break
        dmg = sum(MINE_TIERS[t] for t in picks)
        digs.append(min(MINE_ROWS, dmg))
        chests.append(dmg >= MINE_ROWS)

    # 3. поле и выплата
    btypes  = [b[0] for b in MINE_BLOCKS]
    bw      = [b[1] for b in MINE_BLOCKS]
    mult_of = {b[0]: b[2] for b in MINE_BLOCKS}
    board = [random.choices(btypes, weights=bw, k=MINE_ROWS)
             for _ in range(MINE_COLS)]
    mult = sum(mult_of[board[c][r]] for c in range(MINE_COLS) for r in range(digs[c]))
    mult += MINE_CHEST_BONUS * sum(chests)

    payout = int(round(bet * mult * (p["mine_boost"] or 1)))
    p["coins"] += payout - bet
    p["last_mine"] = now
    p["best_mine"] = max(p.get("best_mine", 0), payout)
    boosted = p["mine_boost"] or 0
    p["mine_boost"] = 0
    save(p, "coins", "last_mine", "best_mine", "mine_boost")
    if payout > bet: bump_quest(p, "earn", payout - bet)
    return ok(p, grid=grid, digs=digs, chests=chests, board=board,
              mult=round(mult, 2), payout=payout, bet=bet,
              new_ach=check_achievements(p))

# ---------- API: АЛХИМИК (2048-merge) ----------
def alchemy_active_talismans(p, now=None):
    """Живые (неистёкшие, неиспользованные) талисманы с остатком времени (сек).
    Индекс `idx` — позиция в исходном массиве (нужна для api_alchemy_boost)."""
    now = now or time.time()
    out = []
    for i, t in enumerate(json.loads(p["alchemy_talismans"])):
        if t.get("used"):
            continue
        left = int(ALCHEMY_TAL_TTL - (now - t.get("ts", now)))
        if left <= 0:
            continue
        out.append({"idx": i, "rank": t["rank"], "left": left})
    return out

def alchemy_new_board(n=2):
    nb = [[0]*ALCHEMY_SIZE for _ in range(ALCHEMY_SIZE)]
    for _ in range(n):
        empties = [(r, c) for r in range(ALCHEMY_SIZE)
                   for c in range(ALCHEMY_SIZE) if nb[r][c] == 0]
        if not empties: break
        r, c = random.choice(empties)
        nb[r][c] = 1 if random.random() > ALCHEMY_TALISMAN_CHANCE else 2
    return nb

def alchemy_slide(board, move):
    """Сдвиг+слияние одинаковых (механика 2048).
    Возвращает список [r,c] клеток итоговой доски, где произошло слияние."""
    n = ALCHEMY_SIZE
    cols = (move in ("left", "right"))
    rev = (move in ("right", "down"))
    merges = []
    for i in range(n):
        line = ([board[i][k] for k in range(n)] if cols
                else [board[k][i] for k in range(n)])
        if rev: line = line[::-1]
        nums = [x for x in line if x]
        out, merged_idx, j = [], [], 0
        while j < len(nums):
            if j + 1 < len(nums) and nums[j] == nums[j+1]:
                merged_idx.append(len(out))
                out.append(nums[j] + 1); j += 2
            else:
                out.append(nums[j]); j += 1
        out += [0] * (n - len(out))
        if rev:
            out = out[::-1]
            merged_idx = [n - 1 - m for m in merged_idx]
        for k in range(n):
            if cols: board[i][k] = out[k]
            else:    board[k][i] = out[k]
        for m in merged_idx:
            merges.append([i, m] if cols else [m, i])
    return merges

async def api_alchemy_move(request):
    p = await auth(request)
    body = request["body"]
    move = body.get("move", "")
    # ЛОК ДНЯ: талисман дня уже получен — играть можно только завтра.
    # До получения талисмана ходы НЕ ограничены (фарми сколько хочешь).
    if p["alchemy_tal_day"] == today_n():
        return err("🔒 Талисман дня уже добыт! Возвращайся завтра за новым.")
    if move == "new":
        p["alchemy_board"] = json.dumps(alchemy_new_board(2))
        save(p, "alchemy_board")
        return ok(p)
    if move not in ("up", "down", "left", "right"):
        return err("Некорректный ход")
    now = time.time()
    if now - p["alchemy_last_move"] < ALCHEMY_MOVE_CD:
        return err("Слишком быстро — подожди")
    board0 = json.loads(p["alchemy_board"])
    before = sum(x for row in board0 for x in row)
    board = [row[:] for row in board0]
    merges = alchemy_slide(board, move)
    after = sum(x for row in board for x in row)
    changed = (board != board0)
    if not changed:                      # упёрлись — ход не считается
        return ok(p, blocked=True)
    # спавн одной плитки в случайную пустую клетку
    empties = [(r, c) for r in range(ALCHEMY_SIZE)
               for c in range(ALCHEMY_SIZE) if board[r][c] == 0]
    spawned = None
    spawn_rank = 0
    if empties:
        r, c = random.choice(empties)
        spawn_rank = 1 if random.random() > ALCHEMY_TALISMAN_CHANCE else 2
        board[r][c] = spawn_rank
        spawned = [r, c]
    # монеты только за слияния (рост минус спавн), с дневным капом
    earn = max(0, (after - before) - spawn_rank) * ALCHEMY_COIN_PER
    room_left = max(0, ALCHEMY_DAILY_CAP - p["alchemy_day_coins"])
    earn = min(earn, room_left)
    # streak дней
    d = today_n()
    if p["alchemy_last_play"] != d:
        p["alchemy_streak"] = p["alchemy_streak"] + 1 if p["alchemy_last_play"] == d - 1 else 1
        p["alchemy_last_play"] = d
    # редкие плитки → коллекция + талисман. Первый добытый талисман за день
    # ставит ЛОК: дальше играть можно только завтра.
    items = json.loads(p["alchemy_items"])
    talismans = json.loads(p["alchemy_talismans"])
    # выбросить протухшие (>24ч) и уже использованные талисманы
    talismans = [t for t in talismans
                 if not t.get("used") and now - t.get("ts", now) < ALCHEMY_TAL_TTL]
    new_item = None
    for (r, c) in merges:
        v = board[r][c]
        if v >= ALCHEMY_TALISMAN_RANK:
            if v not in items:
                items.append(v)
            talismans.append({"rank": v, "used": 0, "ts": now})
            new_item = v
            p["alchemy_tal_day"] = today_n()   # ЛОК дня
    p["alchemy_items"] = json.dumps(items)
    p["alchemy_talismans"] = json.dumps(talismans)
    p["alchemy_board"] = json.dumps(board)
    p["alchemy_moves"] += 1
    p["alchemy_last_move"] = now
    p["alchemy_day_coins"] += earn
    p["coins"] += earn
    p["alchemy_best"] = max(p["alchemy_best"], max((v for row in board for v in row), default=0))
    save(p, "alchemy_board","alchemy_moves","alchemy_last_move","alchemy_day_coins",
         "coins","alchemy_best","alchemy_streak","alchemy_last_play",
         "alchemy_items","alchemy_talismans","alchemy_tal_day")
    if earn: bump_quest(p, "earn", earn)
    return ok(p, spawned=spawned, merges=merges, new_item=new_item,
              new_talisman=bool(new_item), new_ach=check_achievements(p))

async def api_alchemy_boost(request):
    p = await auth(request)
    now = time.time()
    i = int(request["body"].get("idx", -1))
    talismans = json.loads(p["alchemy_talismans"])
    if i < 0 or i >= len(talismans) or talismans[i].get("used"):
        return err("Нет такого талисмана")
    if now - talismans[i].get("ts", now) >= ALCHEMY_TAL_TTL:
        return err("Талисман выдохся — нужен свежий из Алхимика")
    if p["mine_boost"] > 0:
        return err("Буст уже активен — просто копай!")
    talismans[i]["used"] = 1
    p["alchemy_talismans"] = json.loads(talismans)
    p["mine_boost"] = ALCHEMY_BOOST
    save(p, "alchemy_talismans", "mine_boost")
    return ok(p)

# ---- ПОДЗЕМЕЛЬЕ (roguelite) ----
def dungeon_maxhp(p):
    up = json.loads(p["dungeon_upgrades"])
    return DUNGEON_MAX_HP + 20 * int(up.get("hp", 0))

def dungeon_monster(seed, floor, up):
    # детерминированный монстр этажа (сервер = истина, клиент симулирует бой)
    h = abs(hash((seed, floor))) % 100000
    is_boss = (floor % DUNGEON_BOSS_EVERY == 0)
    pool = DUNGEON_BOSSES if is_boss else DUNGEON_MONSTERS
    emoji = pool[h % len(pool)]
    power = int(up.get("power", 0))
    base = floor * 6 + 14
    hp = int(base * (2.4 if is_boss else 1) + 10)
    atk = int((4 + floor * 0.9) * (1.5 if is_boss else 1))
    dmg = 8 + power * 3
    return {"floor": floor, "emoji": emoji, "hp": hp, "atk": atk, "dmg": dmg, "boss": is_boss}

def dungeon_roll_loot(p, floor):
    h = abs(hash((p["dungeon_seed"], floor, "loot"))) % 100000 / 100000.0
    got = []
    for key, chance, emo, name in DUNGEON_LOOT:
        hh = abs(hash((p["dungeon_seed"], floor, key))) % 100000 / 100000.0
        if hh < chance:
            if key == "coin":
                amt = floor * 5 + 10; p["coins"] += amt; got.append({"key":key,"emo":emo,"name":name,"amt":amt})
            elif key == "ingr":
                p["dungeon_ingr"] += 1; got.append({"key":key,"emo":emo,"name":name,"amt":1})
            elif key == "token":
                p["tokens"] += 1; got.append({"key":key,"emo":emo,"name":name,"amt":1})
            elif key == "skin":
                got.append({"key":key,"emo":emo,"name":name,"amt":1})
    return got

async def api_dungeon_start(request):
    p = await auth(request)
    if p["dungeon_floor"]:
        return err("Подземелье уже активно — заверши текущий забег")
    if p["energy"] < DUNGEON_COST_ENERGY:
        return err(f"Мало энергии (нужно {DUNGEON_COST_ENERGY}) — уложи питомца спать 🌙")
    p["dungeon_token"] = secrets.token_hex(8)
    p["dungeon_started"] = time.time()
    p["dungeon_floor"] = 1
    p["dungeon_hp"] = dungeon_maxhp(p)
    p["dungeon_seed"] = str(random.randint(0, 1 << 31))
    p["energy"] = max(0, p["energy"] - DUNGEON_COST_ENERGY)
    up = json.loads(p["dungeon_upgrades"])
    save(p, "dungeon_token","dungeon_started","dungeon_floor","dungeon_hp",
         "dungeon_seed","energy")
    return ok(p, token=p["dungeon_token"],
              monster=dungeon_monster(p["dungeon_seed"], 1, up),
              max_hp=dungeon_maxhp(p), new_ach=check_achievements(p))

async def api_dungeon_action(request):
    p = await auth(request); body = request["body"]
    if not p["dungeon_floor"] or not p["dungeon_token"] or body.get("token") != p["dungeon_token"]:
        return err("Забег не активен")
    action = body.get("action", "")
    up = json.loads(p["dungeon_upgrades"])
    if action == "clear":
        # клиент выиграл бой на текущем этаже -> лут + переход
        floor = p["dungeon_floor"]
        loot = dungeon_roll_loot(p, floor)
        p["coins"] += DUNGEON_REWARD_COIN
        p["dungeon_deepest"] = max(p["dungeon_deepest"], floor)
        if floor % DUNGEON_BOSS_EVERY == 0:
            p["dungeon_bosses"] += 1
        bump_quest(p, "dungeonfloor", 1)
        # реген после этажа
        regen = 4 * int(up.get("regen", 0))
        p["dungeon_hp"] = min(dungeon_maxhp(p), p["dungeon_hp"] + regen)
        if floor >= DUNGEON_MAX_FLOOR:   # вершина — забег завершён
            p["dungeon_floor"] = 0; p["dungeon_token"] = ""
            save(p, "dungeon_hp","dungeon_deepest","dungeon_bosses","coins","dungeon_ingr",
                 "dungeon_floor","dungeon_token","quests")
            bump_quest(p, "dungeon", 1)
            return ok(p, cleared=floor, loot=loot, finished=True,
                      new_ach=check_achievements(p))
        nf = floor + 1
        p["dungeon_floor"] = nf
        p["dungeon_hp"] = min(p["dungeon_hp"], dungeon_maxhp(p))
        save(p, "dungeon_hp","dungeon_deepest","dungeon_bosses","coins","dungeon_ingr",
             "dungeon_floor","quests")
        return ok(p, cleared=floor, loot=loot, finished=False,
                  monster=dungeon_monster(p["dungeon_seed"], nf, up),
                  max_hp=dungeon_maxhp(p), new_ach=check_achievements(p))
    if action == "hp":
        # клиент сообщает HP после боя (авторитет клиента, но капаем к max_hp)
        hp = int(body.get("hp", 0))
        p["dungeon_hp"] = max(0, min(dungeon_maxhp(p), hp))
        if p["dungeon_hp"] <= 0:     # умер — забег окончен
            p["dungeon_floor"] = 0; p["dungeon_token"] = ""
            save(p, "dungeon_hp","dungeon_floor","dungeon_token")
            return ok(p, dead=True, new_ach=check_achievements(p))
        save(p, "dungeon_hp")
        return ok(p)
    if action == "leave":
        floor = p["dungeon_floor"]
        p["dungeon_deepest"] = max(p["dungeon_deepest"], floor - 1)
        p["dungeon_floor"] = 0; p["dungeon_token"] = ""
        save(p, "dungeon_deepest","dungeon_floor","dungeon_token")
        bump_quest(p, "dungeon", 1)
        return ok(p, left_floor=floor, new_ach=check_achievements(p))
    return err("Некорретное действие")

async def api_dungeon_resume(request):
    p = await auth(request)
    if not p["dungeon_floor"] or not p["dungeon_token"]:
        return err("Нет активного забега")
    up = json.loads(p["dungeon_upgrades"])
    return ok(p, token=p["dungeon_token"],
              monster=dungeon_monster(p["dungeon_seed"], p["dungeon_floor"], up),
              max_hp=dungeon_maxhp(p), new_ach=check_achievements(p))

async def api_dungeon_upgrade(request):
    p = await auth(request)
    key = request["body"].get("key", "")
    if key not in DUNGEON_UPGRADES:
        return err("Нет такого улучшения")
    up = json.loads(p["dungeon_upgrades"])
    lvl = int(up.get(key, 0))
    defs = DUNGEON_UPGRADES[key]
    if lvl >= defs["max"]:
        return err("Улучшение максимального уровня")
    cost = defs["cost"][lvl]
    if p["tokens"] < cost:
        return err(f"Нужно {cost} 🎟️ (токенов)")
    p["tokens"] -= cost
    up[key] = lvl + 1
    p["dungeon_upgrades"] = json.dumps(up)
    # апгрейд HP сразу поднимает текущий максимум (если не в забеге)
    if key == "hp" and not p["dungeon_floor"]:
        pass
    save(p, "tokens","dungeon_upgrades")
    return ok(p, new_ach=check_achievements(p))

async def api_battle_start(request):
    p = await auth(request)
    blocked = awake_required(p)
    if blocked: return blocked
    if p["arena_charge"] < 100:
        return err(f"Арена заряжена на {p['arena_charge']}% — играй и ухаживай!")
    if p["energy"] < GAME_COST_ENERGY:
        return err("Мало энергии для боя — уложи питомца спать 🌙")
    # anti-cheat: нельзя стартовать второй бой, пока не завершён предыдущий.
    # Без этого guard клиентский bug двойного `battle_start` (или curl)
    # списывал только один фактический бой, а второй заряд списывал
    # второй раз и блокировал первый токен.
    if p["battle_token"]:
        return err("Бой уже идёт — заверши предыдущий")
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
    # anti-cheat: cap `score` потолком исходя из last_game_rewards.
    # Без cap клиент мог слать score=999999 → my_final >> opp_score →
    # гарантированная победа с +20 🏆 +3 🎟 за бой. Цикл:
    # мини-игра → battle_start → battle_finish{999999} → ∞ трофеев.
    raw = max(0, int(body.get("score", 0)))
    score_cap = max(CATCH_MAX_REWARD * 3, p["best_score"] + 20)
    if raw > score_cap:
        raw = score_cap
    elapsed = time.time() - p["battle_started"]
    if elapsed < 5:
        return err("Бой слишком короткий — пересражайся")
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
                 "fishing_start","fishing_finish","mine_spin",
                  "alchemy_move","alchemy_boost",
                  "dungeon_start","dungeon_action","dungeon_upgrade","dungeon_resume",
                  "battle_start","battle_finish","arena_buy",
                 "claim_quest","buy","equip","top"):
        app.router.add_post(f"/api/{name}", globals()[f"api_{name}"])
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    print(f"Мини-апп на порту {PORT}")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
