// Space Defender - Complete Game JavaScript
// ===== CONFIGURATION =====
const CONFIG = {
    canvasWidth: 800,
    canvasHeight: 600,
    player: { width: 40, height: 40, speed: 5, maxHP: 100, fireRate: 200 },
    bullet: { speed: 10, width: 4, height: 12, damage: 10 },
    enemies: {
        spawnInterval: 1500, minSpeed: 1, maxSpeed: 3,
        types: {
            scout: { hp: 20, score: 100, speed: 2.5, size: 30, color: "#ff4444" },
            assault: { hp: 50, score: 250, speed: 1.5, size: 40, color: "#4488ff" },
            mothership: { hp: 150, score: 500, speed: 0.8, size: 60, color: "#aa44ff" },
        }
    },
    particles: { maxCount: 100, lifeSpan: 1000 },
    stars: { count: 150, minSpeed: 0.5, maxSpeed: 2 },
    soundEnabled: true,
    language: "zh",

    // ===== 难度系统 =====
    // 每档同时改变敌人数值(血量/速度/伤害)、生成节奏、玩家生命与关卡机制(Boss间隔)
    difficulties: {
        easy:   { key: "easy",   enemyHp: 0.70, enemySpeed: 0.85, spawnMul: 1.35, enemyDmg: 0.70,
                  playerHP: 130, dropMul: 1.5,  bossEvery: 6, zh: "简单", en: "Easy" },
        normal: { key: "normal", enemyHp: 1.00, enemySpeed: 1.00, spawnMul: 1.00, enemyDmg: 1.00,
                  playerHP: 100, dropMul: 1.0,  bossEvery: 5, zh: "普通", en: "Normal" },
        hard:   { key: "hard",   enemyHp: 1.45, enemySpeed: 1.25, spawnMul: 0.72, enemyDmg: 1.40,
                  playerHP: 80,  dropMul: 0.75, bossEvery: 4, zh: "困难", en: "Hard" },
    },

    // ===== 游戏模式 =====
    // classic: 推进波次并击败 Boss   endless: 无限递增，比存活时长与击杀   timed: 固定时限内刷分
    modes: {
        classic: { key: "classic", zh: "经典战役", en: "Campaign",
                   descZh: "推进波次，每 5 波迎战 Boss", descEn: "Advance waves, Boss every 5" },
        endless: { key: "endless", zh: "无尽模式", en: "Endless",
                   descZh: "敌人持续增强，比拼存活时长与击杀", descEn: "Escalating foes; survive & kill" },
        timed:   { key: "timed",   zh: "限时挑战", en: "Time Attack",
                   descZh: "60 秒内尽可能多地消灭敌人", descEn: "Kill as many as you can in 60s" },
    },

    timedDuration: 60,   // 限时挑战时长（秒）
};

// ===== STATE =====
const STATE = {
    screen: "start",
    score: 0,
    wave: 1,
    combo: 0,
    maxCombo: 0,
    hp: CONFIG.player.maxHP,
    enemies: [],
    bullets: [],
    particles: [],
    stars: [],
    lastFireTime: 0,
    lastSpawnTime: 0,
    animFrameId: null,
    keys: {},
    // 波次横幅提示（淡入淡出）
    waveBanner: null,
    // 屏幕震动强度（受击反馈）
    shake: 0,

    // ===== 新增系统 =====
    enemyBullets: [],   // 敌方子弹（弹幕闪避）
    powerups: [],       // 掉落道具
    floats: [],         // 伤害飘字
    hitStop: 0,         // 击杀微顿帧剩余毫秒
    boss: null,         // 当前 Boss 对象
    weaponLevel: 1,     // 武器等级：1=单发，2=双发，3=三发散射
    hasLaser: false,    // 是否持有穿透激光
    laserUntil: 0,
    shield: 0,          // 护盾剩余层数（可挡子弹/撞击）
    rapidUntil: 0,      // 加速射击到期时间戳
    screenFlash: 0,     // 全屏闪光强度（爆炸/受伤时）
    kills: 0,           // 本局击杀数

    // ===== 难度与模式 =====
    mode: "classic",        // classic / endless / timed
    difficulty: "normal",   // easy / normal / hard
    timeLeft: 0,            // 限时模式剩余秒数（浮点，显示时向上取整）
    survivalTime: 0,        // 无尽模式已存活秒数
};

// ===== DOM ELEMENTS =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ===== 美术素材 =====
// 生成图部分为白底且右下角有淡淡水印，加载后统一处理：
//   1) 色键(chroma key)把接近白色的像素转透明
//   2) 绘制时裁掉边缘 6%，避开留白与水印
// 任一素材加载失败时，绘制会回退为矢量图形，保证游戏始终可玩。
const ASSET_FILES = {
    player:     "assets/Pixel_art_sci_fi_player_fighte_2026-09-19T11-25-56.png",
    scout:      "assets/Pixel_art_small_red_enemy_scou_2026-09-19T11-27-53.png",
    assault:    "assets/Pixel_art_medium_blue_enemy_as_2026-09-19T11-28-08.png",
    mothership: "assets/Pixel_art_large_purple_enemy_m_2026-09-19T11-28-22.png",
    boss:       "assets/Pixel_art_enormous_menacing_bo_2026-09-19T11-28-42.png",
    puSpread:   "assets/Pixel_art_power_up_icon__golde_2026-09-19T11-28-56.png",
    puShield:   "assets/Pixel_art_power_up_icon__cyan__2026-09-19T11-29-13.png",
    puHeal:     "assets/Pixel_art_power_up_icon__green_2026-09-19T11-29-29.png",
};

const SPRITES = {};          // key -> 处理后的 canvas；null 表示加载失败
let assetsReady = false;
const SPRITE_INSET = 0.06;   // 裁边比例

// 去白底：亮度高于阈值的像素转透明，灰白边缘做半透明过渡
function prepareSprite(img) {
    const w = img.width, h = img.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);

    let data;
    try {
        data = g.getImageData(0, 0, w, h);
    } catch (e) {
        return c;   // 像素不可读(跨域等)时原样返回
    }

    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a === 0) continue;
        const brightness = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (brightness > 235) {
            px[i + 3] = 0;
        } else if (brightness > 200) {
            px[i + 3] = Math.round(a * (235 - brightness) / 35);
        }
    }
    g.putImageData(data, 0, 0);
    return c;
}

function loadAssets() {
    const keys = Object.keys(ASSET_FILES);
    let pending = keys.length;
    if (pending === 0) { assetsReady = true; return; }
    keys.forEach(key => {
        const img = new Image();
        img.onload = () => {
            SPRITES[key] = prepareSprite(img);
            if (--pending === 0) assetsReady = true;
        };
        img.onerror = () => {
            SPRITES[key] = null;
            if (--pending === 0) assetsReady = true;
        };
        img.src = ASSET_FILES[key];
    });
}

// 绘制精灵：按目标宽度等比缩放并居中。返回 false 表示素材不可用，调用方应回退矢量绘制。
function drawSprite(key, cx, cy, targetW, rotation) {
    const s = SPRITES[key];
    if (!s) return false;
    const sx = s.width * SPRITE_INSET, sy = s.height * SPRITE_INSET;
    const sw = s.width * (1 - SPRITE_INSET * 2), sh = s.height * (1 - SPRITE_INSET * 2);
    const scale = targetW / sw;
    const dw = sw * scale, dh = sh * scale;

    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);
    ctx.drawImage(s, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return true;
}

// ===== LANGUAGE SYSTEM =====
const i18n = {
    zh: {
        title: "星际守卫战",
        subtitle: "守护银河系",
        startGame: "开始游戏",
        howToPlay: "操作说明",
        pause: "游戏暂停",
        resume: "继续游戏",
        restart: "重新开始",
        mainMenu: "主菜单",
        gameOver: "游戏结束",
        newRecord: "新纪录！",
        finalScore: "最终得分",
        waveReached: "到达波次",
        maxCombo: "最高连击",
        bestScore: "最高分",
        playAgain: "再来一局",
        score: "得分",
        wave: "Wave",
        hp: "生命",
        combo: "连击",

        // 模式与难度
        mode: "游戏模式",
        difficulty: "难度",
        modeClassic: "经典战役",
        modeEndless: "无尽模式",
        modeTimed: "限时挑战",
        diffEasy: "简单",
        diffNormal: "普通",
        diffHard: "困难",
        survived: "存活时长",
        timeUp: "时间到！",
        seconds: "秒",
        bestPrefix: "最佳",
        modeRecord: "本模式最佳",
    },
    en: {
        title: "Space Defender",
        subtitle: "Protect the Galaxy",
        startGame: "Start Game",
        howToPlay: "How to Play",
        pause: "PAUSED",
        resume: "Resume",
        restart: "Restart",
        mainMenu: "Main Menu",
        gameOver: "GAME OVER",
        newRecord: "NEW RECORD!",
        finalScore: "Final Score",
        waveReached: "Wave Reached",
        maxCombo: "Max Combo",
        bestScore: "Best Score",
        playAgain: "Play Again",
        score: "Score",
        wave: "Wave",
        hp: "HP",
        combo: "COMBO",

        // Mode & difficulty
        mode: "Game Mode",
        difficulty: "Difficulty",
        modeClassic: "Campaign",
        modeEndless: "Endless",
        modeTimed: "Time Attack",
        diffEasy: "Easy",
        diffNormal: "Normal",
        diffHard: "Hard",
        survived: "Survived",
        timeUp: "TIME UP!",
        seconds: "s",
        bestPrefix: "Best",
        modeRecord: "Mode Best",
    }
};

function getI18n() {
    return i18n[CONFIG.language] || i18n.zh;
}

function updateLanguage() {
    const t = getI18n();
    document.querySelectorAll("[data-zh]").forEach(el => {
        el.textContent = CONFIG.language === "zh" ? el.dataset.zh : el.dataset.en;
    });
    document.title = t.title;

    // 模式/难度按钮与记录是 JS 动态生成的，语言切换后需重新渲染
    renderModeSelect();
    renderDiffSelect();
    updateModeRecord();
}

// ===== AUDIO SYSTEM =====
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = CONFIG.soundEnabled;
    }
    
    init() {
        if (!this.enabled) return;
        // 复用同一个 AudioContext：浏览器允许的实例数有限(约6个)，重复创建会泄漏
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { this.enabled = false; return; }
            this.ctx = new AC();
        }
        // 自动播放策略下上下文可能处于 suspended，用户手势后需显式恢复
        if (this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
        }
    }
    
    play(type) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        const now = this.ctx.currentTime;
        switch(type) {
            case "shoot":
                osc.type = "square";
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case "hit":
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            case "explosion":
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case "damage":
                osc.type = "square";
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            case "powerup":
                osc.type = "sine";
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(1180, now + 0.16);
                gain.gain.setValueAtTime(0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.22);
                break;
            case "warning":
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(660, now + 0.14);
                osc.frequency.setValueAtTime(880, now + 0.28);
                gain.gain.setValueAtTime(0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.42);
                osc.start(now);
                osc.stop(now + 0.42);
                break;
            case "bossShot":
                osc.type = "triangle";
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
                gain.gain.setValueAtTime(0.11, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
                osc.start(now);
                osc.stop(now + 0.14);
                break;
            case "bossDown":
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.9);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
                osc.start(now);
                osc.stop(now + 0.9);
                break;
        }
    }
}

const sound = new SoundManager();

// ===== STARS BACKGROUND =====
function initStars() {
    STATE.stars = [];
    for (let i = 0; i < CONFIG.stars.count; i++) {
        STATE.stars.push({
            x: Math.random() * W,
            y: Math.random() * H,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * (CONFIG.stars.maxSpeed - CONFIG.stars.minSpeed) + CONFIG.stars.minSpeed,
            opacity: Math.random() * 0.5 + 0.5,
        });
    }
}

function updateStars() {
    STATE.stars.forEach(star => {
        star.y += star.speed;
        if (star.y > H) {
            star.y = 0;
            star.x = Math.random() * W;
        }
    });
}

function drawStars() {
    STATE.stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ===== PARTICLES =====
function createParticles(x, y, color, count = 10) {
    for (let i = 0; i < count && STATE.particles.length < CONFIG.particles.maxCount; i++) {
        STATE.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: CONFIG.particles.lifeSpan,
            maxLife: CONFIG.particles.lifeSpan,
            color,
            size: Math.random() * 3 + 1,
        });
    }
}

function updateParticles(dt) {
    STATE.particles = STATE.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        return p.life > 0;
    });
}

function drawParticles() {
    STATE.particles.forEach(p => {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });
}

// ===== PLAYER =====
const player = {
    x: 0,
    y: 0,
    width: CONFIG.player.width,
    height: CONFIG.player.height,
};

function resetPlayer() {
    player.x = W / 2;
    player.y = H - 80;
}

function drawPlayer() {
    const now = performance.now();

    // 引擎尾焰（脉动）
    ctx.save();
    const flameLen = 26 + Math.sin(now * 0.02) * 8;
    const fg = ctx.createLinearGradient(0, player.y + 14, 0, player.y + flameLen);
    fg.addColorStop(0, "rgba(120, 240, 255, 0.85)");
    fg.addColorStop(1, "rgba(0, 160, 255, 0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(player.x - 9, player.y + 12);
    ctx.lineTo(player.x + 9, player.y + 12);
    ctx.lineTo(player.x, player.y + flameLen);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 飞船精灵（失败则回退矢量图形）
    const w = player.width * 1.75;
    const ok = drawSprite("player", player.x, player.y, w);
    if (!ok) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.fillStyle = "#00d4ff";
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(-15, 20);
        ctx.lineTo(0, 15);
        ctx.lineTo(15, 20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#0090ff";
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(-6, 5);
        ctx.lineTo(6, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // 护盾光环：层数越多圈越多，带旋转与呼吸
    if (STATE.shield > 0) {
        ctx.save();
        ctx.translate(player.x, player.y);
        for (let i = 0; i < STATE.shield; i++) {
            ctx.save();
            ctx.rotate(now * 0.0012 * (i % 2 === 0 ? 1 : -1) + i);
            ctx.strokeStyle = "rgba(0, 212, 255, " + (0.55 - i * 0.12) + ")";
            ctx.lineWidth = 2;
            ctx.beginPath();
            const rr = 30 + i * 7;
            // 六边形光环
            for (let k = 0; k <= 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
}

function movePlayer(dx, dy) {
    player.x = Math.max(player.width/2, Math.min(W - player.width/2, player.x + dx));
    player.y = Math.max(player.height/2, Math.min(H - player.height/2, player.y + dy));
}

// 将飞船位置限制在画布内
function clampPlayer() {
    player.x = Math.max(player.width/2, Math.min(W - player.width/2, player.x));
    player.y = Math.max(player.height/2, Math.min(H - player.height/2, player.y));
}

// ===== BULLETS =====
// 按武器等级发射：1=单发，2=双发并列，3=三发散射
function fireBullet() {
    const now = Date.now();
    const rapid = now < STATE.rapidUntil;
    const interval = rapid ? CONFIG.player.fireRate * 0.55 : CONFIG.player.fireRate;
    if (now - STATE.lastFireTime < interval) return;
    STATE.lastFireTime = now;

    const sp = CONFIG.bullet.speed;
    const dmg = CONFIG.bullet.damage;
    const lvl = STATE.weaponLevel;

    if (lvl === 1) {
        addBullet(player.x, player.y - 24, 0, sp, dmg);
    } else if (lvl === 2) {
        addBullet(player.x - 11, player.y - 20, 0, sp, dmg);
        addBullet(player.x + 11, player.y - 20, 0, sp, dmg);
    } else {
        addBullet(player.x,       player.y - 26, 0,     sp, dmg);
        addBullet(player.x - 14,  player.y - 16, -0.17, sp, dmg);
        addBullet(player.x + 14,  player.y - 16,  0.17, sp, dmg);
    }

    sound.play("shoot");
}

function addBullet(x, y, angle, speed, dmg) {
    STATE.bullets.push({
        x, y,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        width: CONFIG.bullet.width,
        height: CONFIG.bullet.height,
        damage: dmg,
        color: "#00ff88",
    });
}

function updateBullets() {
    STATE.bullets = STATE.bullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        return b.y > -40 && b.y < H + 40 && b.x > -40 && b.x < W + 40;
    });
}

function drawBullets() {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00ff88";
    STATE.bullets.forEach(b => {
        ctx.fillStyle = b.color || "#00ff88";
        // 按飞行方向旋转，散射弹也能保持朝向
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vx, -b.vy));
        ctx.fillRect(-b.width / 2, -b.height / 2, b.width, b.height);
        ctx.restore();
    });
    ctx.restore();
}

// ===== ENEMIES =====
function spawnEnemy() {
    const types = Object.keys(CONFIG.enemies.types);
    const type = types[Math.floor(Math.random() * types.length)];
    const config = CONFIG.enemies.types[type];
    const d = getDifficulty();

    // 无尽模式：强度随时间持续递增（每存活 30 秒提升一档）
    const endlessBoost = STATE.mode === "endless"
        ? 1 + Math.floor(STATE.survivalTime / 30) * 0.25
        : 1;

    // 难度同时作用于血量与速度
    const hp = (config.hp + STATE.wave * 5) * d.enemyHp * endlessBoost;
    const speed = config.speed * (1 + STATE.wave * 0.1) * d.enemySpeed
                  * Math.min(1.8, endlessBoost);

    STATE.enemies.push({
        x: Math.random() * (W - config.size) + config.size/2,
        y: -config.size,
        size: config.size,
        speed,
        hp,
        maxHp: hp,
        type,
        color: config.color,
        score: config.score,
        flash: 0,
        fireTimer: 900 + Math.random() * 900,   // 首次开火延迟，给玩家反应时间
        canFire: true,
        // 水平正弦漂移，避免轨迹是一条直线
        driftAmp: type === "scout" ? 1.1 : 0.6,
        driftPhase: Math.random() * Math.PI * 2,
    });
}

function updateEnemies(dt) {
    STATE.enemies = STATE.enemies.filter(e => {
        e.y += e.speed;
        if (e.flash > 0) e.flash -= 16;   // 闪白计时递减

        // 水平正弦漂移，轨迹不再是直线
        e.driftPhase += 0.028;
        e.x += Math.sin(e.driftPhase) * e.driftAmp;
        e.x = Math.max(e.size * 0.5, Math.min(W - e.size * 0.5, e.x));

        // 敌机开火
        updateEnemyFire(e, dt);

        // 敌机到达底部，扣血
        if (e.y > H + e.size) {
            STATE.hp -= 10 * getDifficulty().enemyDmg;
            STATE.combo = 0;
            STATE.shake = 8;
            updateHPBar();
            updateCombo();
            if (STATE.hp <= 0) {
                endGame();
            }
            return false;
        }
        return true;
    });
}

function drawEnemies() {
    STATE.enemies.forEach(e => {
        // 敌机类型名与素材 key 同名，优先用精灵图
        const key = e.type;
        const w = e.size * 1.35;
        const ok = drawSprite(key, e.x, e.y, w);

        // 素材不可用时回退为矢量倒三角
        if (!ok) {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.moveTo(0, e.size/2);
            ctx.lineTo(-e.size/2, -e.size/2);
            ctx.lineTo(e.size/2, -e.size/2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 受击闪白：以叠加混合重绘精灵，保持轮廓
        if (e.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.85, e.flash / 120) * 0.75;
            ctx.globalCompositeOperation = "lighter";
            drawSprite(key, e.x, e.y, w);
            ctx.restore();
        }

        // 血条
        const hpPercent = e.hp / e.maxHp;
        const barW = e.size * 1.1;
        const barY = e.y - e.size * 0.78;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(e.x - barW/2, barY, barW, 4);
        ctx.fillStyle = hpPercent > 0.5 ? "#00ff88" : hpPercent > 0.25 ? "#ffaa00" : "#ff4444";
        ctx.fillRect(e.x - barW/2, barY, barW * hpPercent, 4);
    });
}

// ===== 敌方子弹（弹幕闪避） =====
function fireEnemyBullet(x, y, angle, color, speed) {
    STATE.enemyBullets.push({
        x, y,
        vx: Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        r: 5,
        color: color || "#ff6655",
        life: 6000,
    });
}

// 敌机按类型开火：越靠下的敌机越有威胁，但刚出生(屏幕上方)时给玩家反应时间
function updateEnemyFire(e, dt) {
    if (!e.canFire || e.y < 0) return;
    e.fireTimer -= dt * (1 + STATE.wave * 0.05);
    if (e.fireTimer > 0) return;

    // 瞄准玩家
    const aim = Math.atan2(player.x - e.x, player.y - e.y);

    if (e.type === "scout") {
        fireEnemyBullet(e.x, e.y + e.size*0.3, aim, "#ff6655", 4.6);
        e.fireTimer = 2400;
    } else if (e.type === "assault") {
        for (let k = -1; k <= 1; k++) {
            fireEnemyBullet(e.x, e.y + e.size*0.3, aim + k * 0.20, "#66aaff", 4.2);
        }
        e.fireTimer = 2000;
    } else {
        // 母舰：五连扇形
        for (let k = -2; k <= 2; k++) {
            fireEnemyBullet(e.x, e.y + e.size*0.3, aim + k * 0.24, "#cc66ff", 3.8);
        }
        e.fireTimer = 2600;
    }
}

function updateEnemyBullets(dt) {
    STATE.enemyBullets = STATE.enemyBullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.life -= dt;
        return b.life > 0 && b.y < H + 40 && b.y > -40 && b.x > -40 && b.x < W + 40;
    });
}

function drawEnemyBullets() {
    ctx.save();
    STATE.enemyBullets.forEach(b => {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.35, b.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

// ===== 道具系统 =====
const POWERUP_DEFS = {
    spread: { sprite: "puSpread", color: "#ffd700", zh: "散射强化", en: "SPREAD UP" },
    shield: { sprite: "puShield", color: "#00d4ff", zh: "能量护盾", en: "SHIELD" },
    heal:   { sprite: "puHeal",   color: "#00ff88", zh: "船体修复", en: "REPAIR" },
};
const POWERUP_KEYS = Object.keys(POWERUP_DEFS);

function maybeDropPowerup(x, y) {
    if (STATE.boss) return;                    // Boss 战期间不掉落
    // 基础掉落率（残血时更高），再按难度缩放
    const base = STATE.hp < 45 ? 0.22 : 0.13;
    const chance = base * getDifficulty().dropMul;
    if (Math.random() > chance) return;

    let type;
    if (STATE.hp < 45 && Math.random() < 0.55) type = "heal";
    else type = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];

    STATE.powerups.push({
        x, y, vy: 1.7, type, r: 15,
        spin: Math.random() * Math.PI * 2,
        life: 12000,
    });
}

function updatePowerups(dt) {
    STATE.powerups = STATE.powerups.filter(p => {
        p.y += p.vy;
        p.spin += dt * 0.004;
        p.life -= dt;
        return p.y < H + 30 && p.life > 0;
    });
}

function drawPowerups() {
    STATE.powerups.forEach(p => {
        const def = POWERUP_DEFS[p.type];

        // 呼吸光晕
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.3 * Math.sin(p.spin * 5);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
        g.addColorStop(0, def.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 精灵 + 轻微摇摆
        const ok = drawSprite(def.sprite, p.x, p.y, p.r * 2.3, Math.sin(p.spin) * 0.15);
        if (!ok) {
            ctx.save();
            ctx.fillStyle = def.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

function applyPowerup(type) {
    const def = POWERUP_DEFS[type];
    const lang = CONFIG.language;
    let text = lang === "zh" ? def.zh : def.en;

    if (type === "spread") {
        if (STATE.weaponLevel < 3) {
            STATE.weaponLevel++;
            text = (lang === "zh" ? def.zh : def.en) + " Lv." + STATE.weaponLevel;
        } else {
            STATE.score += 300;
            text = lang === "zh" ? "已满级 +300" : "MAX +300";
        }
    } else if (type === "shield") {
        STATE.shield = Math.min(3, STATE.shield + 1);
        text = (lang === "zh" ? def.zh : def.en) + " x" + STATE.shield;
    } else if (type === "heal") {
        STATE.hp = Math.min(CONFIG.player.maxHP, STATE.hp + 35);
        updateHPBar();
    }

    addFloat(player.x, player.y - 46, text, def.color, 20);
    STATE.screenFlash = Math.max(STATE.screenFlash, 0.22);
    sound.play("powerup");
}

// ===== 伤害飘字 =====
function addFloat(x, y, text, color, size) {
    STATE.floats.push({
        x, y, text, color,
        size: size || 16,
        life: 800, maxLife: 800,
        vy: -0.055,
    });
}

function updateFloats(dt) {
    STATE.floats = STATE.floats.filter(f => {
        f.life -= dt;
        f.y += f.vy * dt;
        return f.life > 0;
    });
}

function drawFloats() {
    STATE.floats.forEach(f => {
        const t = 1 - f.life / f.maxLife;
        const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const scale = t < 0.15 ? 0.6 + 0.4 * (t / 0.15) : 1;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(f.x, f.y);
        ctx.scale(scale, scale);
        ctx.font = "bold " + f.size + "px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
    });
}

// ===== COLLISION DETECTION =====
// 玩家受击的统一入口：护盾优先抵挡，否则扣血
function hitPlayer(amount) {
    if (STATE.shield > 0) {
        STATE.shield--;
        STATE.shake = 10;
        createParticles(player.x, player.y, "#00d4ff", 14);
        addFloat(player.x, player.y - 42,
            CONFIG.language === "zh" ? "护盾抵挡" : "BLOCKED", "#00d4ff", 15);
        sound.play("hit");
        return;
    }
    STATE.hp -= amount * getDifficulty().enemyDmg;   // 难度缩放受到的伤害
    STATE.combo = 0;
    STATE.shake = 14;
    STATE.screenFlash = Math.max(STATE.screenFlash, 0.35);
    createParticles(player.x, player.y, "#ff4444", 10);
    sound.play("damage");
    updateHPBar();
    updateCombo();
    if (STATE.hp <= 0) endGame();
}

function checkCollisions() {
    // --- 我方子弹 vs 敌机 ---
    STATE.bullets = STATE.bullets.filter(b => {
        let hit = false;
        STATE.enemies = STATE.enemies.filter(e => {
            const dx = b.x - e.x, dy = b.y - e.y;
            if (dx*dx + dy*dy < Math.pow(e.size/2 + b.width/2, 2)) {
                e.hp -= b.damage;
                e.flash = 120;
                hit = true;
                createParticles(e.x, e.y, e.color, 4);
                addFloat(e.x, e.y - e.size*0.4, String(b.damage), "#ffffff", 13);

                if (e.hp <= 0) {
                    const gain = Math.floor(e.score * (1 + STATE.combo * 0.1));
                    STATE.score += gain;
                    STATE.combo++;
                    STATE.maxCombo = Math.max(STATE.maxCombo, STATE.combo);
                    STATE.kills++;
                    STATE.hitStop = Math.min(70, 26 + STATE.combo * 1.5);   // 击杀微顿帧
                    createParticles(e.x, e.y, e.color, 18);
                    createParticles(e.x, e.y, "#ffdd66", 8);
                    addFloat(e.x, e.y, "+" + gain, "#ffd700", 17);
                    sound.play("explosion");
                    maybeDropPowerup(e.x, e.y);
                    checkWaveProgress();
                    updateHUD();
                    updateCombo();
                    return false;
                }
                sound.play("hit");
            }
            return true;
        });
        return !hit;
    });

    // --- 我方子弹 vs Boss ---
    if (STATE.boss && !STATE.boss.entering) {
        const bs = STATE.boss;
        const hitR = bs.size * 0.5;
        STATE.bullets = STATE.bullets.filter(b => {
            const dx = b.x - bs.x, dy = b.y - bs.y;
            if (dx*dx + dy*dy < hitR * hitR) {
                bs.hp -= b.damage;
                bs.flash = 90;
                createParticles(b.x, b.y, "#ff8844", 3);
                addFloat(b.x, b.y - 12, String(b.damage), "#ffffff", 12);
                if (bs.hp <= 0) killBoss();
                return false;
            }
            return true;
        });
    }

    // --- 敌方子弹 vs 玩家 ---
    STATE.enemyBullets = STATE.enemyBullets.filter(b => {
        const dx = b.x - player.x, dy = b.y - player.y;
        const rr = b.r + player.width * 0.3;
        if (dx*dx + dy*dy < rr*rr) {
            hitPlayer(12);
            return false;
        }
        return true;
    });

    // --- 敌机 vs 玩家 ---
    STATE.enemies = STATE.enemies.filter(e => {
        const dx = player.x - e.x, dy = player.y - e.y;
        const rr = e.size/2 + player.width/2;
        if (dx*dx + dy*dy < rr*rr) {
            hitPlayer(20);
            createParticles(e.x, e.y, e.color, 12);
            return false;
        }
        return true;
    });

    // --- Boss vs 玩家 ---
    if (STATE.boss && !STATE.boss.entering) {
        const bs = STATE.boss;
        const dx = player.x - bs.x, dy = player.y - bs.y;
        const rr = bs.size * 0.5 + player.width/2;
        if (dx*dx + dy*dy < rr*rr) hitPlayer(25);
    }

    // --- 道具拾取 ---
    STATE.powerups = STATE.powerups.filter(p => {
        const dx = p.x - player.x, dy = p.y - player.y;
        const rr = p.r + player.width * 0.55;
        if (dx*dx + dy*dy < rr*rr) {
            applyPowerup(p.type);
            return false;
        }
        return true;
    });
}

// ===== Boss 战 =====
function spawnBoss() {
    const hp = 700 + STATE.wave * 200;
    STATE.boss = {
        x: W / 2,
        y: -140,
        size: 170,
        hp, maxHp: hp,
        entering: true,
        phase: 1,
        attackTimer: 1500,
        pattern: 0,
        flash: 0,
        vx: 1.5,
    };
    STATE.waveBanner = {
        text: CONFIG.language === "zh" ? "警告 · BOSS 来袭" : "WARNING · BOSS",
        life: 2000, maxLife: 2000,
    };
    sound.play("warning");
}

function updateBoss(dt) {
    const b = STATE.boss;
    if (!b) return;

    if (b.flash > 0) b.flash -= 16;

    // 入场动画
    if (b.entering) {
        b.y += 1.4;
        if (b.y >= 125) b.entering = false;
        return;
    }

    // 左右游走
    b.x += b.vx;
    if (b.x < b.size * 0.42 || b.x > W - b.size * 0.42) b.vx *= -1;

    // 血量过半进入二阶段：提速、加密弹幕
    if (b.phase === 1 && b.hp <= b.maxHp * 0.5) {
        b.phase = 2;
        b.vx *= 1.5;
        STATE.screenFlash = 0.5;
        STATE.shake = 16;
    }

    // 攻击节奏
    b.attackTimer -= dt * (b.phase === 2 ? 1.45 : 1);
    if (b.attackTimer <= 0) {
        bossAttack(b);
        b.attackTimer = b.phase === 2 ? 1050 : 1650;
    }
}

function bossAttack(b) {
    b.pattern = (b.pattern + 1) % 3;
    const aim = Math.atan2(player.x - b.x, player.y - b.y);
    const speed = 4.4 + STATE.wave * 0.08;

    if (b.pattern === 0) {
        // 扇形弹幕：向下半圆铺开
        const n = b.phase === 2 ? 15 : 10;
        for (let i = 0; i < n; i++) {
            const a = Math.PI - (i / (n - 1)) * Math.PI;
            fireEnemyBullet(b.x, b.y + b.size * 0.3, a, "#ff4466", speed);
        }
    } else if (b.pattern === 1) {
        // 瞄准点射（连发）
        const shots = b.phase === 2 ? 5 : 3;
        for (let i = 0; i < shots; i++) {
            setTimeout(() => {
                if (STATE.boss !== b || STATE.screen !== "playing") return;
                fireEnemyBullet(b.x, b.y + b.size * 0.3, aim, "#ffaa33", speed + 1.2);
            }, i * 110);
        }
    } else {
        // 双炮口交叉弹
        for (let i = -1; i <= 1; i++) {
            fireEnemyBullet(b.x, b.y + b.size * 0.3, aim + i * 0.42, "#ff66cc", speed);
        }
    }
    sound.play("bossShot");
}

function drawBoss() {
    const b = STATE.boss;
    if (!b) return;

    const w = b.size * 1.5;
    const ok = drawSprite("boss", b.x, b.y, w);
    if (!ok) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.fillStyle = "#cc2244";
        ctx.beginPath();
        ctx.moveTo(0, b.size/2);
        ctx.lineTo(-b.size/2, -b.size/2);
        ctx.lineTo(b.size/2, -b.size/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    if (b.flash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.8, b.flash / 120) * 0.7;
        ctx.globalCompositeOperation = "lighter";
        drawSprite("boss", b.x, b.y, w);
        ctx.restore();
    }

    // 顶部 Boss 血条（下移避开 HUD）
    const barW = Math.min(W * 0.8, 620);
    const x0 = (W - barW) / 2, y0 = 92;
    const ratio = Math.max(0, b.hp / b.maxHp);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x0, y0, barW, 16);
    const g = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
    g.addColorStop(0, "#ff2244");
    g.addColorStop(1, "#ff8844");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, barW * ratio, 16);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, barW - 1, 15);
    ctx.font = "bold 12px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BOSS", W / 2, y0 + 8);
    ctx.restore();
}

function killBoss() {
    const b = STATE.boss;
    if (!b) return;

    const reward = 5000 + STATE.wave * 400;
    STATE.score += reward;
    STATE.kills++;

    // 连环爆炸
    for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * b.size * 0.6;
        setTimeout(() => {
            createParticles(b.x + Math.cos(ang) * rad, b.y + Math.sin(ang) * rad, "#ff8844", 18);
            sound.play("explosion");
        }, i * 90);
    }

    addFloat(b.x, b.y, "+" + reward, "#ffd700", 32);
    STATE.screenFlash = 1;
    STATE.shake = 26;
    STATE.enemyBullets = [];      // 清屏，给玩家喘息
    STATE.boss = null;

    sound.play("bossDown");

    // 掉落补给
    STATE.powerups.push({ x: b.x - 50, y: b.y, vy: 1.6, type: "heal",   r: 15, spin: 0, life: 12000 });
    STATE.powerups.push({ x: b.x + 50, y: b.y, vy: 1.6, type: "spread", r: 15, spin: 0, life: 12000 });

    checkWaveProgress();
    updateHUD();
}

// ===== WAVE SYSTEM =====
function checkWaveProgress() {
    if (STATE.boss) return;                              // Boss 战期间暂停推进波次

    // 阈值累积递增：升到第 N 波需要 250*N*(N+1) 分。
    // 这样 Boss 的高额奖励不会让波次瞬间跳跃好几级。
    const bossEvery = getDifficulty().bossEvery;
    const allowBoss = STATE.mode !== "timed";            // 限时模式不出 Boss，纯刷分

    let advanced = false;
    while (STATE.score >= 250 * STATE.wave * (STATE.wave + 1)) {
        STATE.wave++;
        advanced = true;
        if (allowBoss && STATE.wave % bossEvery === 0) break;   // 到达 Boss 波，停止继续推进
    }
    if (!advanced) return;

    // 生成间隔随波次加快，基准受难度影响
    CONFIG.enemies.spawnInterval = Math.max(500, 1500 * getDifficulty().spawnMul - STATE.wave * 80);
    updateHUD();

    if (allowBoss && STATE.wave % bossEvery === 0) {
        spawnBoss();                                     // 按难度间隔迎战 Boss
    } else {
        STATE.waveBanner = {
            text: CONFIG.language === "zh" ? `第 ${STATE.wave} 波` : `WAVE ${STATE.wave}`,
            life: 1600,
            maxLife: 1600,
        };
    }
}

// ===== HUD UPDATE =====
function updateHUD() {
    document.getElementById("scoreValue").textContent = Math.floor(STATE.score);
    document.getElementById("levelValue").textContent = STATE.wave;
}

function updateCombo() {
    const comboEl = document.getElementById("comboDisplay");
    if (STATE.combo > 1) {
        comboEl.classList.remove("hidden");
        document.getElementById("comboCount").textContent = STATE.combo;
        const txt = comboEl.querySelector(".combo-text");
        txt.textContent = CONFIG.language === "zh" ? "连击" : "COMBO";
    } else {
        comboEl.classList.add("hidden");
    }
}

function updateHPBar() {
    // 生命上限随难度变化，分母要用当前难度的数值
    const maxHP = getDifficulty().playerHP;
    const hpPercent = Math.max(0, STATE.hp / maxHP * 100);
    document.getElementById("hpBar").style.width = hpPercent + "%";
}

// 限时模式倒计时显示
function updateTimerDisplay() {
    const el = document.getElementById("timerValue");
    if (el) el.textContent = Math.max(0, Math.ceil(STATE.timeLeft));
}

// ===== HIGH SCORE (localStorage) =====
const HIGH_SCORE_KEY = "spaceDefenderHighScore";
const LANG_KEY = "spaceDefenderLang";

// 安全读写：以 file:// 打开、或浏览器隐私模式下访问 localStorage 会抛异常，
// 这里兜底保证存储不可用时游戏依然能正常运行
function safeGet(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 存储不可用：静默忽略，不影响游戏
    }
}

function getHighScore() {
    return parseInt(safeGet(HIGH_SCORE_KEY, "0"), 10) || 0;
}

function setHighScore(score) {
    safeSet(HIGH_SCORE_KEY, String(score));
}

function updateHighScoreDisplay() {
    const hs = getHighScore();
    const el = document.getElementById("highScoreText");
    el.textContent = CONFIG.language === "zh" ? `最高分: ${hs}` : `Best: ${hs}`;
}

// ===== SCREEN MANAGEMENT =====
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
    
    // 控制 HUD 显示
    const hud = document.getElementById("hud");
    if (screenId === "hud" || STATE.screen === "playing") {
        hud.classList.remove("hidden");
    } else {
        hud.classList.add("hidden");
    }
}

function hideAllScreens() {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
}

// ===== GAME FLOW =====
function startGame() {
    sound.init();
    
    // 重置状态
    STATE.screen = "playing";
    STATE.score = 0;
    STATE.wave = 1;
    STATE.combo = 0;
    STATE.maxCombo = 0;
    const d = getDifficulty();
    STATE.hp = d.playerHP;                              // 难度决定初始生命
    STATE.enemies = [];
    STATE.bullets = [];
    STATE.particles = [];
    STATE.lastFireTime = 0;
    STATE.lastSpawnTime = Date.now();
    STATE.shake = 0;
    CONFIG.enemies.spawnInterval = 1500 * d.spawnMul;   // 难度决定生成节奏

    // 模式相关计时
    STATE.timeLeft = STATE.mode === "timed" ? CONFIG.timedDuration : 0;
    STATE.survivalTime = 0;

    // 新系统重置
    STATE.enemyBullets = [];
    STATE.powerups = [];
    STATE.floats = [];
    STATE.hitStop = 0;
    STATE.boss = null;
    STATE.weaponLevel = 1;
    STATE.shield = 0;
    STATE.rapidUntil = 0;
    STATE.screenFlash = 0;
    STATE.kills = 0;
    
    // 开局提示（按模式显示不同文案）
    const zh = CONFIG.language === "zh";
    let bannerText = zh ? "第 1 波" : "WAVE 1";
    if (STATE.mode === "endless") {
        bannerText = zh ? "无尽模式 · 开始" : "ENDLESS · START";
    } else if (STATE.mode === "timed") {
        bannerText = zh ? `限时挑战 · ${CONFIG.timedDuration}秒` : `TIME ATTACK · ${CONFIG.timedDuration}s`;
    }

    STATE.waveBanner = {
        text: bannerText,
        life: 1600,
        maxLife: 1600,
    };
    
    resetPlayer();
    initStars();
    updateHUD();
    updateHPBar();
    updateCombo();
    
    hideAllScreens();
    document.getElementById("hud").classList.remove("hidden");

    // 仅限时模式显示倒计时面板
    const timerPanel = document.getElementById("timerPanel");
    if (timerPanel) {
        if (STATE.mode === "timed") timerPanel.classList.remove("hidden");
        else timerPanel.classList.add("hidden");
    }
    updateTimerDisplay();

    // 启动游戏循环
    if (STATE.animFrameId) cancelAnimationFrame(STATE.animFrameId);
    lastTime = performance.now();
    STATE.animFrameId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
    if (STATE.screen !== "playing") return;
    STATE.screen = "paused";
    cancelAnimationFrame(STATE.animFrameId);
    showScreen("pauseScreen");
    // 暂停时仍保留 HUD，方便查看当前分数与波次
    document.getElementById("hud").classList.remove("hidden");
}

function resumeGame() {
    if (STATE.screen !== "paused") return;
    STATE.screen = "playing";
    hideAllScreens();
    document.getElementById("hud").classList.remove("hidden");
    lastTime = performance.now();
    STATE.animFrameId = requestAnimationFrame(gameLoop);
}

// timeUp: 是否因限时模式时间耗尽而结束（true 时标题显示"时间到"）
function endGame(timeUp) {
    // 幂等守卫：同一帧内可能同时触发"漏机"与"撞机"，避免重复结算
    if (STATE.screen === "gameover") return;

    STATE.screen = "gameover";
    cancelAnimationFrame(STATE.animFrameId);

    const zh = CONFIG.language === "zh";

    // 保存全局最高分
    const finalScore = Math.floor(STATE.score);
    const hs = getHighScore();
    const isNewRecord = finalScore > hs;
    if (isNewRecord) setHighScore(finalScore);

    // 保存当前「模式×难度」的最佳记录
    const prevBest = getRecord(STATE.mode, STATE.difficulty);
    const best = saveRecord(STATE.mode, STATE.difficulty, {
        score: finalScore,
        wave: STATE.wave,
        kills: STATE.kills,
        survived: STATE.survivalTime,
    });

    // 已登录则同步到 Supabase。未登录 / 未配置 / 网络异常都静默跳过，
    // 保证本地结算流程不受影响。
    if (typeof Auth !== "undefined" && Auth) {
        Auth.saveRecord("defender", STATE.mode, STATE.difficulty, {
            score: finalScore,
            wave: STATE.wave,
            kills: STATE.kills,
            survived_seconds: Math.floor(STATE.survivalTime)
        }).catch(function () { /* 云同步失败时忽略 */ });
    }
    // 本局是否刷新了该模式下的最佳
    const beatMode = !prevBest || (
        STATE.mode === "endless"
            ? (STATE.survivalTime > (prevBest.survived || 0) || STATE.kills > (prevBest.kills || 0))
            : STATE.mode === "timed"
                ? (finalScore > (prevBest.score || 0) || STATE.kills > (prevBest.kills || 0))
                : (STATE.wave > (prevBest.wave || 0) || finalScore > (prevBest.score || 0))
    );

    // 填充结算数据
    document.getElementById("finalScore").textContent = finalScore;
    document.getElementById("finalWave").textContent = STATE.wave;
    document.getElementById("finalKills").textContent = STATE.kills;
    document.getElementById("finalCombo").textContent = STATE.maxCombo;
    document.getElementById("bestScore").textContent = getHighScore();

    // 存活时长（仅无尽模式显示）
    const rowSurvived = document.getElementById("rowSurvived");
    if (rowSurvived) {
        if (STATE.mode === "endless") {
            rowSurvived.classList.remove("hidden");
            document.getElementById("finalSurvived").textContent =
                Math.floor(STATE.survivalTime) + (zh ? " 秒" : "s");
        } else {
            rowSurvived.classList.add("hidden");
        }
    }

    // 本模式最佳
    const rowModeBest = document.getElementById("rowModeBest");
    if (rowModeBest) {
        rowModeBest.classList.remove("hidden");
        const el = document.getElementById("finalModeBest");
        if (STATE.mode === "endless") {
            el.textContent = Math.floor(best.survived || 0) + (zh ? "秒 / " : "s / ") + (best.kills || 0) + (zh ? "杀" : "k");
        } else if (STATE.mode === "timed") {
            el.textContent = (best.score || 0) + (zh ? " 分 / " : " pts / ") + (best.kills || 0) + (zh ? "杀" : "k");
        } else {
            el.textContent = (zh ? "第 " : "W") + (best.wave || 0) + (zh ? " 波 / " : " / ") + (best.score || 0) + (zh ? " 分" : " pts");
        }
    }

    // 结束标题：区分阵亡与时间到
    const goTitle = document.getElementById("goTitle");
    if (goTitle) {
        goTitle.textContent = timeUp ? (zh ? "时间到！" : "TIME UP!") : (zh ? "游戏结束" : "GAME OVER");
    }

    const newRecordEl = document.getElementById("newHighScore");
    if (isNewRecord || beatMode) {
        newRecordEl.classList.remove("hidden");
        newRecordEl.querySelector("span").textContent = zh ? "新纪录！" : "NEW RECORD!";
    } else {
        newRecordEl.classList.add("hidden");
    }

    hideAllScreens();
    showScreen("gameOverScreen");
    document.getElementById("hud").classList.add("hidden");
    updateHighScoreDisplay();
    updateModeRecord();
}

function goToMenu() {
    STATE.screen = "start";
    cancelAnimationFrame(STATE.animFrameId);
    hideAllScreens();
    showScreen("startScreen");
    document.getElementById("hud").classList.add("hidden");
    updateHighScoreDisplay();
    updateModeRecord();     // 回菜单时刷新「当前模式×难度」的最佳记录
}

// ===== MAIN GAME LOOP =====
let lastTime = 0;

function gameLoop(timestamp) {
    if (STATE.screen !== "playing") return;

    // 限幅，避免切换标签页回来后一次性跳跃过大
    const dt = Math.min(50, timestamp - lastTime);
    lastTime = timestamp;

    // 击杀微顿帧：短暂冻住世界以强化打击感（只重绘，不推进逻辑）
    if (STATE.hitStop > 0) {
        STATE.hitStop -= dt;
        drawFrame(dt);
        if (STATE.screen === "playing") {
            STATE.animFrameId = requestAnimationFrame(gameLoop);
        }
        return;
    }

    // ---- 逻辑更新 ----
    updateStars();
    handleInput();

    // 模式计时：限时模式倒计时归零即结束；无尽模式累计存活时长
    if (STATE.mode === "timed") {
        STATE.timeLeft -= dt / 1000;
        updateTimerDisplay();
        if (STATE.timeLeft <= 0) {
            STATE.timeLeft = 0;
            endGame(true);          // 时间到，非阵亡
            return;
        }
    } else if (STATE.mode === "endless") {
        STATE.survivalTime += dt / 1000;
    }
    updateBullets();
    updateEnemyBullets(dt);
    updateFloats(dt);

    // 敌机生成（Boss 战期间放缓，避免夹击过难）
    const now = Date.now();
    const interval = STATE.boss ? CONFIG.enemies.spawnInterval * 2.4 : CONFIG.enemies.spawnInterval;
    if (now - STATE.lastSpawnTime > interval) {
        spawnEnemy();
        STATE.lastSpawnTime = now;
    }

    updateEnemies(dt);
    updateBoss(dt);
    updatePowerups(dt);
    checkCollisions();
    updateParticles(dt);

    if (STATE.screenFlash > 0) {
        STATE.screenFlash = Math.max(0, STATE.screenFlash - dt * 0.0022);
    }

    // ---- 绘制 ----
    drawFrame(dt);

    if (STATE.screen === "playing") {
        STATE.animFrameId = requestAnimationFrame(gameLoop);
    }
}

// 绘制一帧（与逻辑更新分离，微顿帧时只重绘）
function drawFrame(dt) {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    // 屏幕震动：强度指数衰减
    if (STATE.shake > 0) {
        ctx.translate((Math.random() - 0.5) * STATE.shake, (Math.random() - 0.5) * STATE.shake);
        STATE.shake *= 0.85;
        if (STATE.shake < 0.5) STATE.shake = 0;
    }

    drawStars();
    drawPowerups();
    drawEnemies();
    drawBoss();
    drawBullets();
    drawEnemyBullets();
    drawPlayer();
    drawParticles();
    ctx.restore();

    // 以下绘制在震动层之外，保持文字稳定
    drawFloats();
    drawScreenFlash();
    drawBuffBar();
    drawWaveBanner(dt);
}

// 全屏闪光（Boss 击破 / 玩家受伤）
function drawScreenFlash() {
    if (STATE.screenFlash <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, STATE.screenFlash * 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// 左下角增益状态：火力等级与护盾层数
function drawBuffBar() {
    const zh = CONFIG.language === "zh";
    const items = [
        { text: (zh ? "火力" : "PWR") + " Lv." + STATE.weaponLevel, color: "#ffd700" },
    ];
    if (STATE.shield > 0) {
        items.push({ text: (zh ? "护盾" : "SHLD") + " x" + STATE.shield, color: "#00d4ff" });
    }

    ctx.save();
    ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let y = H - 24;
    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const w = ctx.measureText(it.text).width + 18;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(12, y - 11, w, 22);
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, 21, y);
        y -= 28;
    }
    ctx.restore();
}

// 波次提示横幅：淡入淡出 + 缩放动画
function drawWaveBanner(dt) {
    if (!STATE.waveBanner) return;
    
    const b = STATE.waveBanner;
    b.life -= dt;
    if (b.life <= 0) {
        STATE.waveBanner = null;
        return;
    }
    
    const t = 1 - b.life / b.maxLife;          // 0 -> 1 进度
    // 前 25% 淡入放大，之后淡出
    const alpha = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
    const scale = t < 0.25 ? 0.7 + 0.3 * (t / 0.25) : 1;
    
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(W / 2, H / 3);
    ctx.scale(scale, scale);
    ctx.font = "bold 42px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#00d4ff";
    ctx.fillStyle = "#00d4ff";
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
}

// ===== INPUT =====
// 指针/触屏是否按下（按下即持续射击）
let isPointerDown = false;
let isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
// 移动端飞船相对手指的向上偏移量，避免手指遮挡飞船
const TOUCH_OFFSET_Y = 60;

function handleInput() {
    const speed = CONFIG.player.speed;
    
    // 键盘方向键 / WASD 移动
    if (STATE.keys["ArrowLeft"]  || STATE.keys["a"]) movePlayer(-speed, 0);
    if (STATE.keys["ArrowRight"] || STATE.keys["d"]) movePlayer(speed, 0);
    if (STATE.keys["ArrowUp"]    || STATE.keys["w"]) movePlayer(0, -speed);
    if (STATE.keys["ArrowDown"]  || STATE.keys["s"]) movePlayer(0, speed);
    
    // 空格键 或 指针按住 -> 连续射击（fireBullet 内部有射速限制）
    if (STATE.keys[" "] || isPointerDown) {
        fireBullet();
    }
}

// 键盘
document.addEventListener("keydown", e => {
    STATE.keys[e.key] = true;
    
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        if (STATE.screen === "playing") {
            pauseGame();
        } else if (STATE.screen === "paused") {
            resumeGame();
        }
    }
    if (e.key === " " && STATE.screen === "playing") {
        e.preventDefault();
    }
});

document.addEventListener("keyup", e => {
    STATE.keys[e.key] = false;
});

// 客户端坐标 -> 画布逻辑坐标
function toGameCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
}

// 鼠标移动（飞船跟随）
canvas.addEventListener("mousemove", e => {
    if (STATE.screen !== "playing") return;
    const p = toGameCoords(e.clientX, e.clientY);
    player.x = p.x;
    player.y = p.y;
    clampPlayer();
});

// 鼠标按下/松开：按住可连续射击
canvas.addEventListener("mousedown", e => {
    if (STATE.screen !== "playing") return;
    isPointerDown = true;
});
window.addEventListener("mouseup", () => { isPointerDown = false; });

// 触屏（移动端）：飞船显示在手指上方，避免手指遮挡
function handleTouch(e) {
    if (STATE.screen !== "playing") return;
    e.preventDefault();
    const touch = e.touches[0];
    const p = toGameCoords(touch.clientX, touch.clientY);
    player.x = p.x;
    player.y = p.y - TOUCH_OFFSET_Y;   // 上移，避免被手指遮挡
    clampPlayer();
}

canvas.addEventListener("touchstart", e => {
    isTouchDevice = true;
    isPointerDown = true;
    handleTouch(e);
}, { passive: false });

canvas.addEventListener("touchmove", handleTouch, { passive: false });

canvas.addEventListener("touchend", () => { isPointerDown = false; }, { passive: false });
canvas.addEventListener("touchcancel", () => { isPointerDown = false; }, { passive: false });

// ===== 模式与难度选择 =====
function getDifficulty() {
    return CONFIG.difficulties[STATE.difficulty] || CONFIG.difficulties.normal;
}

function getMode() {
    return CONFIG.modes[STATE.mode] || CONFIG.modes.classic;
}

// 生成模式选择卡片
function renderModeSelect() {
    const grid = document.getElementById("modeSelectGrid");
    if (!grid) return;
    const zh = CONFIG.language === "zh";
    grid.innerHTML = "";
    Object.values(CONFIG.modes).forEach(m => {
        const card = document.createElement("div");
        card.className = "mode-option" + (m.key === STATE.mode ? " active" : "");
        card.innerHTML = '<span class="mo-name">' + (zh ? m.zh : m.en) + '</span>'
                       + '<span class="mo-desc">' + (zh ? m.descZh : m.descEn) + '</span>';
        card.addEventListener("click", () => {
            STATE.mode = m.key;
            renderModeSelect();
            updateModeRecord();
        });
        grid.appendChild(card);
    });
}

// 生成难度选择按钮
function renderDiffSelect() {
    const row = document.getElementById("diffSelectRow");
    if (!row) return;
    const zh = CONFIG.language === "zh";
    row.innerHTML = "";
    Object.values(CONFIG.difficulties).forEach(d => {
        const btn = document.createElement("button");
        btn.className = "diff-option" + (d.key === STATE.difficulty ? " active" : "");
        btn.textContent = zh ? d.zh : d.en;
        btn.addEventListener("click", () => {
            STATE.difficulty = d.key;
            renderDiffSelect();
            updateModeRecord();
        });
        row.appendChild(btn);
    });
    updateDiffDesc();
}

// 难度数值说明
function updateDiffDesc() {
    const el = document.getElementById("diffDesc");
    if (!el) return;
    const d = getDifficulty();
    const zh = CONFIG.language === "zh";
    el.textContent = zh
        ? `敌机血量×${d.enemyHp} · 速度×${d.enemySpeed} · 伤害×${d.enemyDmg} · 我方生命${d.playerHP} · Boss每${d.bossEvery}波`
        : `HP×${d.enemyHp} · Spd×${d.enemySpeed} · DMG×${d.enemyDmg} · Your HP ${d.playerHP} · Boss/${d.bossEvery}w`;
}

// ===== 各模式×难度的最佳记录 =====
const RECORD_KEY = "spaceDefenderRecords";

function getRecords() {
    try {
        return JSON.parse(safeGet(RECORD_KEY, "{}")) || {};
    } catch (e) {
        return {};
    }
}

function getRecord(mode, diff) {
    return getRecords()[mode + "_" + diff] || null;
}

// 保存成绩：按模式比较对应指标，取更优者
function saveRecord(mode, diff, data) {
    try {
        const r = getRecords();
        const key = mode + "_" + diff;
        const old = r[key] || {};
        const merged = Object.assign({}, old);
        if (mode === "endless") {
            merged.survived = Math.max(old.survived || 0, data.survived || 0);
            merged.kills = Math.max(old.kills || 0, data.kills || 0);
        } else if (mode === "timed") {
            merged.score = Math.max(old.score || 0, data.score || 0);
            merged.kills = Math.max(old.kills || 0, data.kills || 0);
        } else {
            merged.wave = Math.max(old.wave || 0, data.wave || 0);
            merged.score = Math.max(old.score || 0, data.score || 0);
        }
        r[key] = merged;
        safeSet(RECORD_KEY, JSON.stringify(r));
        return merged;
    } catch (e) {
        return data;
    }
}

// 显示当前模式+难度下的历史最佳
function updateModeRecord() {
    const el = document.getElementById("modeRecord");
    if (!el) return;
    const rec = getRecord(STATE.mode, STATE.difficulty);
    const zh = CONFIG.language === "zh";
    if (!rec) {
        el.textContent = zh ? "暂无记录" : "No record yet";
        return;
    }
    if (STATE.mode === "endless") {
        el.textContent = zh
            ? `最佳：存活 ${Math.floor(rec.survived || 0)}秒 · 击杀 ${rec.kills || 0}`
            : `Best: ${Math.floor(rec.survived || 0)}s · ${rec.kills || 0} kills`;
    } else if (STATE.mode === "timed") {
        el.textContent = zh
            ? `最佳：${rec.score || 0} 分 · 击杀 ${rec.kills || 0}`
            : `Best: ${rec.score || 0} pts · ${rec.kills || 0} kills`;
    } else {
        el.textContent = zh
            ? `最佳：第 ${rec.wave || 0} 波 · ${rec.score || 0} 分`
            : `Best: Wave ${rec.wave || 0} · ${rec.score || 0} pts`;
    }
}

// ===== BUTTON EVENTS =====
function bindButton(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
}

bindButton("btnStart", startGame);
bindButton("btnHowTo", () => { hideAllScreens(); showScreen("howToScreen"); });
bindButton("btnBack1", () => { hideAllScreens(); showScreen("startScreen"); });
bindButton("btnResume", resumeGame);
bindButton("btnRestartPause", startGame);
bindButton("btnQuitPause", goToMenu);
bindButton("btnRetry", startGame);
bindButton("btnMenu", goToMenu);

bindButton("btnLang", () => {
    CONFIG.language = CONFIG.language === "zh" ? "en" : "zh";
    safeSet(LANG_KEY, CONFIG.language);
    updateLanguage();
    updateHighScoreDisplay();
    updateCombo();
});

// ===== CANVAS RESIZE (响应式 + 高DPI精细渲染) =====
// W / H 为逻辑尺寸（CSS 像素），canvas 内部按 devicePixelRatio 放大以保证清晰度
let W = 800;
let H = 600;
let dpr = 1;

function resizeCanvas() {
    const container = document.getElementById("gameContainer");
    const cssW = container.clientWidth || 800;
    const cssH = container.clientHeight || 600;
    
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 限制为2避免性能问题
    
    W = cssW;
    H = cssH;
    
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    
    // 缩放上下文，使绘制坐标使用逻辑像素
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    if (STATE.screen !== "playing") {
        resetPlayer();
        initStars();
    }
}

window.addEventListener("resize", resizeCanvas);

// ===== INIT =====
function init() {
    const savedLang = safeGet(LANG_KEY, null);
    if (savedLang === "zh" || savedLang === "en") CONFIG.language = savedLang;
    
    resizeCanvas();
    initStars();
    resetPlayer();
    updateLanguage();
    updateHighScoreDisplay();
    updateHPBar();
    showScreen("startScreen");

    // 异步加载美术素材；加载完成后自动替换矢量绘制
    loadAssets();
}

init();
