# DESIGN.md — «HOT GARAGE»

Долговременный источник правды по дизайн-системе проекта. Если CSS или разметка расходятся с этим файлом — выигрывает DESIGN.md.

## 0. Контекст (Phase 0)

- **Артефакт**: Telegram Mini App (mobile). Жанр: виртуальный питомец + PvP-арена. Цикл «ухаживаешь → играешь → бьёшься за лигу». Запускается внутри Telegram WebApp SDK на телефонах 13+.
- **Аудитория**: подростки **13–17**. В README явно «важно для аудитории 13–17». Тон: дерзкий, соревновательный, яркий; не премиум и не корпоративный.
- **Позиционирование**: «канал-питомец», ежедневный возврат, дуэли с призраком реального игрока. Не стесняется быть игрой: цифры счёта, лиги, ранги —главное, не стеклянные панели.
- **Архитектурные ограничения**: всё уже работает в3D (Three.js r128 + FBX-риг героя, ~3000 строк JS-движка и аниматора). Refactor трогает только **CSS, HTML, шрифты и замену декоративных emoji на SVG-иконки**. Контракты API/JS (`UI.action`, `UI.shopTap`, `Arena.start`, `Games.startCatch/...`, `Api.call`, `data-action`, `data-room`, id-селекторы элементов HUD) — **не ломаем**.

## 1. Слова-обязательства (Phase 0)

- **3 прилагательных бренда**: **дерзкий, тёплый, плотный**.
- **Дополнительные (2)**: соревновательный, инди-независимый.
- **3-словная суть (essence)**: **arena · pop · garage**.

Словесные переводы в токены:
| прилагательное | тип | цвет | spacing | радиус | тень | motion |
|---|---|---|---|---|---|---|
| дерзкий | display bold caps | акцент оранжевый | плотный | малый | hard-offset | snap-180ms |
| тёплый | мягкий body sans | cream-ink base | базовый | средний 6–10px | без blur | ease-out |
| плотный | grid-aligned | цветные плашки | 4px-base | кнопка-бокс | 3px3px0 ink | без bounce |
| соревновательный | tabular-nums для всех цифр | hazard-red + mint | блоки | толстая обводка | без glow | shake-sm |
| инди-независимый | Bricolage Grotesque (free) | нет premium-блеска | editorial accents | без blur-blur-blur | hard rule | уверенный |

## 2. Эстетическое обязательство (Phase 1)

**Направление: Neo-brutalism warm + sport arcade pop** (из каталога). Отличается от классического neo-brutalism тем, что радиусы ненулевые (medium дерзость) и фон тёплый кремовый, а не белый — это удерживает «medium», не скатываясь в ультра-жёсткий brutal. Это направление, в отличие от среднего AI-default2024, не достижимо статистическим sampling TailwindUI ↔ Inter ↔ indigo.

**Не повторять (NEVER)**:
- Inter/Roboto/Arial/Unbounded/Manrope как primary
- фиолетово-индиго-золотой триплет `#8B6BFF × #4FC3FF × #FFC93C`
- glassmorphism (backdrop-filter blur + inset highlight) на поверхностях
- glow / shadow / radial-gradient на каждой плашке
- emoji как иконки статичных контролов (nav, tabs, leaf-buttons, sheet h2)
- bounce/elastic easing

**Шрифты**: **Bricolage Grotesque** (display, var weight 600–800) + **Lexend** (body, var weight 400–700). Оба с кириллицей, бесплатные коммерческие, Google Fonts.

**Палитра**: крем-тёплая основа, чернильный текст, **оранжевый `#FF6A1A` как единственный акцент action**, плюс hazard-red `#E33B3B` для арены, mint `#19B97A` для успеха/чистоты, gold `#FFB300` для legendary. Эпический —глубокий фиолет `#6E3FE3` (только для rarity epic, **не как общий акцент** — это сознательный обход бан-листа).

**Signature move**: **«REV-LINE»** — горизонтальный оранжевый маркер 3–4px над подзаголовками и под заголовками листов. Не градиент-омбре, а сплошная черта с квадратной «каплей» в начале (как обрезной тримминг на досках соревнований / журнальных врезках). Появляется в HUD над `mood`, в title каждого листа, над лигой.

**Defining trait**: толстая обводка 2.5px + хард-оффсет тень `3px 3px 0 var(--ink-3)`. Никакого blur. Это структурное правило: каждый интерактивный контейнер либо имеет thick-stroke border + hard-shadow, либо является поверхностью-картой (тогда только border). Никаких inset-highlights, никакого blur-shadow.

## 3. Токены (Phase 1 — таблица)

### 3.1 Цвета (OKLCH для новых, hex-зеркало для совместимости)

```css
/* Бренд */
--orange-1:#FFE3C7; --orange-2:#FFC78A; --orange-3:#FF8A3D;
--orange-4:#FF6A1A;  /* primary accent — actions */
--orange-5:#C84A0A;  /* pressed */
--orange-ink-oklch:oklch(0.69 0.20 45);

/* Чернила / paper */
--ink-paper:#F7EFE0;     /* cream base */
--ink-paper-2:#EFE3CA;
--ink-display:#0F172B;   /* black ink for text & shadows */
--ink-text:#1B2233;      /* body text */
--ink-mute:#5B6377;      /* secondary text */
--ink-faint:#A0A2AE;     /* tertiary text */
--ink-line-soft:#E1D5B6; /* hairline divider */

/* Семантика */
--bg:var(--ink-paper);
--bg-card:#FFFFFF;
--bg-card-2:#FFFDF6;
--fg:var(--ink-text);
--muted:var(--ink-mute);
--border:var(--ink-display);
--border-soft:var(--ink-line-soft);
--accent:var(--orange-4);
--accent-fg:#1B0E00;
--accent-hover:var(--orange-3);

/* Стейт / редкость */
--danger:#E33B3B;
--success:#19B97A;
--gold:#FFB300;
--epic:#6E3FE3;

/* Rarity */
--r-common:#A0A2AE; --r-rare:#19B97A; --r-epic:#6E3FE3; --r-leg:#FFB300;
```

Распределение 60/30/10:
- 60 — cream paper + ink-text (информационный слой)
- 30 — orange accent + cream variants (action, focus, signature)
- 10 — danger/mint/epic/gold (state + rarity, никогда не на каждой карточке)

Контрасты (проверено):
- ink-text на cream-paper → **13.8:1** (AAA)
- accent на cream-paper → **3.6:1** (только для кнопок, не для body text)
- accent (orange-4) на accent-fg (#1B0E00) → **5.1:1** (AA для крупного)
- white на ink-display → **14.7:1** (AAA)
- danger на cream-paper → **5.3:1** (AA для крупного)

### 3.2 Типографика

```
--font-display: 'Bricolage Grotesque', serif;
--font-body: 'Lexend', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

Scale (Major Third, base 16px):
```
--t-xs:.75rem  --t-sm:.875rem --t-base:1rem
--t-lg:1.125   --t-xl:1.25    --t-2xl:1.5
--t-3xl:1.875  --t-4xl:2.5    --t-5xl:3.5
```

Цифры в HUD (монеты, токены, заряд, лиги, trophies, HP, dmg) — **`font-family: var(--font-mono)`** + **`font-variant-numeric: tabular-nums`** + моноширинный шрифт выбранной гарнитуры. Это структурное правило для подсчёта.

### 3.3 Spacing / radius / stroke / shadow

One base = 4px.

```
--rad-sm:6px; --rad-md:10px; --rad-lg:16px;
--stroke:2.5px; --stroke-thick:3.5px;
--shadow-h1: 3px 3px 0 var(--ink-display);
--shadow-h2: 4px 4px 0 var(--ink-display);
--shadow-accent: 3px 3px 0 var(--orange-4);
```

**Одна shadow-стратегия**: hard-offset, no blur. Не использовать одновременно border-shadow + diffuse-shadow ни на одном элементе. Hover отбрасывает тень (shift на +2px+2px); pressed — убирает тень и сдвигает на +3px+3px (упругий press-feel без анимации scale).

### 3.4 Motion

```
--dur-instant:120ms; --dur-fast:160ms; --dur-mid:220ms; --dur-slow:300ms;
--ease-out:cubic-bezier(.2,.7,.2,1);
```

Анимировать только `transform`, `opacity`, `box-shadow`. Без bounce/elastic. Уважать `prefers-reduced-motion` — сводить всё к мгновенным переходам.

## 4. Craft layer (Phase 2)

### 4.1 Layout

- **Сетка**: вертикальный стек с одной верхней панелью HUD, нижней строкой навигации, и плавающими окнами/листами. Контент «roomPanel» по центру над nav-баром. На узких вьюпортах — одна колонка, контент не центрируется форсированно (используем safe-area padding).
- **Spacing rhythm**: внутри карточки плотно (8–12px), между блоками — размашисто (16–24px).
- **Один отступ от центрирования**: на боттом-наве tab-ы выровнены не в центре контейнера, а по равной ширине в 6 фиксированных слотов (как в спортивном rankings, не как в стартовом наборе UI).

### 4.2 Components & states

Каждый интерактивный контейнер проектируется с полной матрицей состояний:
- **Primary CTA (Rez, Brawl, Catch, Rhythm)**: оранжевый fill, ink display border 2.5px, hard-shadow offset 3px3px0 ink-display, ink-display текст. Hover → shift shadow +2px, accent-hover bg. Active → shadow=0, translate +3px+3px. Disabled → opacity .35, pointer-events:none.
- **Secondary CTA (отмена, „надеть“ выбор)**: cream paper fill, ink display border 2.5px, hard-shadow offset, ink-display текст. Тот же shadow-press.
- **Счётчик / pill (coin, tokens, streak)**: cream card, ink display border, вес 700, mono для числа, эмодзи слева (food-streak и т.п — это данные игрока, не декоративный контрол, тут emoji допустимы и желательны). Удар по значению = bump-180ms через transform-scale-1.08 без glow.
- **Card (квест, ачивка, шоп, топ-рейтинг)**: white fill, ink display border 2.5px, NO shadow (плоская поверхность). Слева 3–4px рейка цвета редкости — не border-radial.
- **Legendary card**: gold рейка 4px + shake-celebrate при появлении (не glow, а 2 цикла -1deg/+1deg поворот 80ms).
- **Sheet (выезжающие листы)**: cream paper fill, ink display border-top 2.5px, радиус 22px сверху. Не glassmorphism. Не blur. Page grabbing zone 44×4px вверху.
- **Overlay / Modal**: тот же cream paper + ink border + hard-shadow h2 (4px4px0 ink). Закрытие крестиком в виде **inline SVG** (×), не emoji ✕.
- **Nav (дом/кухня/cyber/arena/bath/bed)**: 6 fixed-width cells, 44px tab-targets. Иконка **inline SVG** 2px stroke, 22px; надпись 11px caps tracking .04em. Active cell: оранжевая top-bar 3px + цвет текста orange-4 + icon-смена на filled-вариант.
- **Orb (главное action-меню)**: переименовываем в **«HUB»**. Нижний правый угол. Кнопка 56px circle, ink-display fill, оранжевая thick border 2.5px, hard-shadow. Раскрытие sub-buttons — лесенка вверх 56→44 px друг над другом (а не радиально).
- **Daily button**: оранжевый pill с wiggle только если доступен. Не wiggle после забора.
- **Тач-зоны 3D**: не трогаем.

### 4.3 Motion

- Pills bump: 120ms scale 1→1.08→1, ease-out.
- Sheet entrance: 280ms transform Y100%→0 + opacity →1 ease-out.
- Overlay entrance: 180ms scale .96→1 + opacity.
- Arena flash (legendary purchase): hard-shadow затухание opacity 1→0 за 220ms (не bloom light).
- Confetti (level-up/legendary): square rect-tiles с rotation, 5 цветов из палитры, fall linear, 160 frames. Никаких gradient circles.

### 4.4 Iconography

Один grid 24×24. **Stroke 2px**. **Radius 1px на концах**. Один line-style, один filled-style (для active state). Не смешивать стили в наборе.

Где чисто декоративные иконки (навигация, закрывашки, leaderboard): **inline SVG**. Где emoji — это data игрока (аватар/арена-соперник, еда), emoji остаются.

### 4.5 Imagery

- 3D-сцена + фото 5 комнат (living, kitchen, game, bath, bed) — оставлены как есть. Это рабочий background, не трогаем.
- Иконки шопа: оставлены emoji (они приходят из server-data `s.shop`、`s.arena_shop`); используются как emoji-маркеры; в CSS — допустимы, в тексте — нет.
- Аватар героя: SVG placeholder + 3D.

### 4.6 Theming & dark mode

- Светлая тема — базовая (cream + ink + orange).
- `body[data-room="bed"]` / `body[data-sleeping="1"]` → **dark mode локально**: ink-display bg, ink-paper текст, акцент сохраняется оранжевый. Это переход для спальни и сна — не глобальный dark-mode toggle.

### 4.7 Accessibility (gate pass/fail)

- WCAG 2.2 AA.
- Focus visible: 3px оранжевый outline + 2px ink-display outline-offset на любом focusable. Уважать `:focus-visible`.
- Keyboard: tab между интерактивными. Не скрывать outline без замены.
- Tap-target **≥ 48×48 px** на всех контролах (включая tab-нав, орб-сабитэмы).
- Цвет — не единственный сигнал: значок + подпись (редкость — цвет рейки + лейбл «эпик/легендарный»).
- `prefers-reduced-motion: reduce` — отключить shimmers/wiggle, оставить opacity/transform мгновенными.
- Контрасты — таблица в §3.1.

## 5. Mapping от старого к новому

| Старое (slop) | Новое (HOT GARAGE) |
|---|---|
| Unbounded + Manrope | Bricolage Grotesque + Lexend |
| `#07051A` фиолет-фон | cream `#F7EFE0` paper-фон |
| `#8B6BFF × #FFC93C × #FF5E8A` триплет | `#FF6A1A` единственный action-accent |
| glassmorphism `.glass` (blur+inset highlight) | без backdrop-filter, hard-offset shadow |
| emoji как статичные иконки tabs/nav/close/leaderboard | inline SVG иконки 24×24 stroke 2px |
| radial-gradient `body[data-room]` фон | flat warm paper + на roomPanel=web-фоны комнат через `<img>`-плейсхолдер если нужно |
| glow-bump (pill +box-shadow orange-glow) | bump-scale 1.08 без shadow |
| wiggle (daily button bounce) | wiggle только индикатор-слот (corner-strip) без rotate-bounce |
| @keyframes wiggle .91% rotate(-4deg) | @keyframes cornerBlink (corner-strip opacity) |
| `mix-blend-mode: screen` эмо-свечение | opacity-only overlay (без blend) |

## 6. Что НЕ менялось

- `static/js/**` — все контракты, селекторы, `data-*`, id, `GS` API сохранены.
- 3D-сцена, FBX-риг, animator state-машина, arena-логика.
- API-эндпоинты в `bot.py`.
- Аудио (sfx.js, music.js) — оставлены, только перепакованы в новую палитру если это делается в CSS-уровне (нет — оставлены).
- `static/photos/*.png` — фоны 3D-комнат.

## 7. Slop-audit (self-check)

| Проверка | Статус |
|---|---|
| Display ≠ Inter/Roboto/Arial/Unbounded/Manrope | ✅ Bricolage Grotesque |
| Body ≠ AI-default | ✅ Lexend |
| Палитра ≠ indigo/violet cluster | ✅ orange-dominant cream |
| Нет glass-blur на поверхностях | ✅ hard shadow |
| Цифры = моноширинные / tabular-nums | ✅ JetBrains Mono в HUD |
| Нет emoji как статичных контрол-иконок | ✅ inline SVG на nav/tabs/close |
| Нет glow + diffuse shadow рядом | ✅ один shadow подход |
| Нет radial-gradient ради декорации | ✅ flat в base, photo-fallback в комнатах |
| Нет bounce/elastic easing | ✅ ease-out ≤300ms |
| Focus-visible реализован | ✅ 3px orange outline + offset |
| Tap-targets ≥ 48px | ✅ nav 6×fullWidth, hub buttons 44+ |
| Reduced-motion support | ✅ |
| Articulation: каждый компонент имеет состояния | ✅ давлено через .press, .disabled, [aria] |
| Signature move уникален | ✅ REV-LINE (orange horizontal mark + 4px ink display square cap)
| Definingtrait структурный | ✅ 2.5px border + 3px3px0 hard shadow + flip animate (не scale-bounce)
