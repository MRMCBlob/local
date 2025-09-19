import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    const configPath = join(__dirname, '../../config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json, using defaults:', error.message);
    config = {
        leveling: {
            baseXpRequired: 100,
            xpMultiplier: 1.5
        }
    };
}

export class LevelingDatabase {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.init();
    }

    init() {
        try {
            // Ensure directory exists
            const dbDir = dirname(this.dbPath);
            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }

            this.db = new Database(this.dbPath);
            console.log('Connected to SQLite database');
            this.createTables();
        } catch (error) {
            console.error('Database initialization error:', error);
        }
    }

    createTables() {
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                guild_id TEXT NOT NULL,
                username TEXT NOT NULL,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                last_message_time INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createEconomyTable = `
            CREATE TABLE IF NOT EXISTS economy (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                money INTEGER DEFAULT 1000,
                bank_money INTEGER DEFAULT 0,
                bank_level INTEGER DEFAULT 1,
                daily_streak INTEGER DEFAULT 0,
                last_daily DATETIME DEFAULT NULL,
                last_steal DATETIME DEFAULT NULL,
                total_winnings INTEGER DEFAULT 0,
                total_losses INTEGER DEFAULT 0,
                total_stolen INTEGER DEFAULT 0,
                total_stolen_from INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, guild_id)
            )
        `;

        try {
            this.db.exec(createUsersTable);
            console.log('Users table ready');
        } catch (err) {
            console.error('Error creating users table:', err.message);
        }

        try {
            this.db.exec(createEconomyTable);
            console.log('Economy table ready');
            
            // Add missing columns for existing databases
            this.addMissingColumns();
        } catch (err) {
            console.error('Error creating economy table:', err.message);
        }

        // Create index for faster lookups
        const createIndex = `
            CREATE INDEX IF NOT EXISTS idx_user_guild 
            ON users(user_id, guild_id)
        `;

        const createEconomyIndex = `
            CREATE INDEX IF NOT EXISTS idx_economy_user_guild 
            ON economy(user_id, guild_id)
        `;

        try {
            this.db.exec(createIndex);
            this.db.exec(createEconomyIndex);
        } catch (err) {
            console.error('Error creating index:', err.message);
        }
    }

    addMissingColumns() {
        try {
            // Check if columns exist and add them if they don't
            const columns = [
                'bank_money INTEGER DEFAULT 0',
                'bank_level INTEGER DEFAULT 1', 
                'last_steal DATETIME DEFAULT NULL',
                'total_stolen INTEGER DEFAULT 0',
                'total_stolen_from INTEGER DEFAULT 0'
            ];

            for (const column of columns) {
                const columnName = column.split(' ')[0];
                try {
                    // Try to select the column to see if it exists
                    this.db.prepare(`SELECT ${columnName} FROM economy LIMIT 1`).get();
                } catch (error) {
                    // Column doesn't exist, add it
                    console.log(`Adding missing column: ${columnName}`);
                    this.db.exec(`ALTER TABLE economy ADD COLUMN ${column}`);
                }
            }

            // Check if events tables exist and create them if they don't
            try {
                // Check if events table exists
                const eventsTableExists = this.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='events'
                `).get();

                if (!eventsTableExists) {
                    console.log('Creating events table...');
                    this.db.exec(`
                        CREATE TABLE events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            guild_id TEXT NOT NULL,
                            event_type TEXT NOT NULL,
                            event_name TEXT NOT NULL,
                            start_date DATETIME NOT NULL,
                            end_date DATETIME NOT NULL,
                            is_active BOOLEAN DEFAULT 1,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                // Check if event_participants table exists
                const participantsTableExists = this.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='event_participants'
                `).get();

                if (!participantsTableExists) {
                    console.log('Creating event_participants table...');
                    this.db.exec(`
                        CREATE TABLE event_participants (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            user_id TEXT NOT NULL,
                            guild_id TEXT NOT NULL,
                            coins_earned INTEGER DEFAULT 0,
                            items_earned TEXT DEFAULT '[]',
                            participated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (event_id) REFERENCES events (id),
                            UNIQUE(event_id, user_id, guild_id)
                        )
                    `);
                }

                // Check if shop tables exist
                const shopTableExists = this.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='shop_inventory'
                `).get();

                if (!shopTableExists) {
                    console.log('Creating shop_inventory table...');
                    this.db.exec(`
                        CREATE TABLE shop_inventory (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            guild_id TEXT NOT NULL,
                            item_id TEXT NOT NULL,
                            item_name TEXT NOT NULL,
                            item_description TEXT NOT NULL,
                            price INTEGER NOT NULL,
                            category TEXT NOT NULL,
                            rarity TEXT NOT NULL,
                            effects TEXT DEFAULT '[]',
                            is_event_item BOOLEAN DEFAULT 0,
                            event_type TEXT,
                            date_added DATE NOT NULL,
                            date_expires DATE,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `);
                }

                const userInventoryTableExists = this.db.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='user_inventory'
                `).get();

                if (!userInventoryTableExists) {
                    console.log('Creating user_inventory table...');
                    this.db.exec(`
                        CREATE TABLE user_inventory (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id TEXT NOT NULL,
                            guild_id TEXT NOT NULL,
                            item_id TEXT NOT NULL,
                            item_name TEXT NOT NULL,
                            quantity INTEGER DEFAULT 1,
                            effects TEXT DEFAULT '[]',
                            purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            expires_at DATETIME,
                            is_active BOOLEAN DEFAULT 1
                        )
                    `);
                }
            } catch (error) {
                console.error('Error creating events tables:', error);
            }

            // Add missing effects column to shop_inventory if it doesn't exist
            try {
                const shopEffectsColumnExists = this.db.prepare(`
                    PRAGMA table_info(shop_inventory)
                `).all().some(column => column.name === 'effects');

                if (!shopEffectsColumnExists) {
                    console.log('Adding effects column to shop_inventory table...');
                    this.db.exec(`ALTER TABLE shop_inventory ADD COLUMN effects TEXT DEFAULT '[]'`);
                }
            } catch (error) {
                console.error('Error adding effects column to shop_inventory:', error);
            }

            // Fix existing inventory items with missing effects
            try {
                console.log('Checking for inventory items with missing effects...');
                this.fixInventoryEffects();
            } catch (error) {
                console.error('Error fixing inventory effects:', error);
            }
        } catch (error) {
            console.error('Error adding missing columns:', error);
        }
    }

    // Fix existing inventory items with missing or empty effects
    fixInventoryEffects() {
        try {
            // Get all inventory items with empty effects
            const itemsToFix = this.db.prepare(`
                SELECT * FROM user_inventory 
                WHERE effects = '[]' OR effects = '' OR effects IS NULL
            `).all();

            if (itemsToFix.length === 0) {
                console.log('No inventory items need effects fixing.');
                return;
            }

            console.log(`Found ${itemsToFix.length} inventory items with missing effects.`);

            // Map of item names to their correct effects
            const itemEffectsMap = {
                '🍎 Golden Apple': ['instant_coins'],
                '🧪 Health Potion': ['luck_boost_1h'],
                '⚡ Energy Drink': ['xp_boost_30m'],
                '📦 Mystery Box': ['random_rewards']
            };

            let fixedCount = 0;
            const updateEffects = this.db.prepare(`
                UPDATE user_inventory 
                SET effects = ? 
                WHERE id = ?
            `);

            for (const item of itemsToFix) {
                const correctEffects = itemEffectsMap[item.item_name];
                if (correctEffects) {
                    const effectsJson = JSON.stringify(correctEffects);
                    updateEffects.run(effectsJson, item.id);
                    console.log(`Fixed effects for ${item.item_name} (ID: ${item.id}): ${effectsJson}`);
                    fixedCount++;
                }
            }

            console.log(`Successfully fixed effects for ${fixedCount} inventory items.`);
        } catch (error) {
            console.error('Error fixing inventory effects:', error);
        }
    }

    // Calculate level from XP using exponential progression
    calculateLevel(xp) {
        if (xp < config.leveling.baseXpRequired) return 1;
        
        let level = 1;
        let totalXpRequired = 0;
        
        while (totalXpRequired <= xp) {
            const xpForNextLevel = this.xpRequiredForLevel(level + 1);
            if (totalXpRequired + xpForNextLevel > xp) break;
            totalXpRequired += xpForNextLevel;
            level++;
        }
        
        return level;
    }

    // Calculate XP required for a specific level (exponential growth)
    xpRequiredForLevel(level) {
        if (level <= 1) return 0;
        return Math.floor(config.leveling.baseXpRequired * Math.pow(config.leveling.xpMultiplier, level - 2));
    }

    // Calculate total XP needed to reach a specific level
    totalXpForLevel(level) {
        if (level <= 1) return 0;
        
        let totalXp = 0;
        for (let i = 2; i <= level; i++) {
            totalXp += this.xpRequiredForLevel(i);
        }
        return totalXp;
    }

    // Calculate XP needed for next level from current XP
    xpNeededForNextLevel(currentXp) {
        const currentLevel = this.calculateLevel(currentXp);
        const totalXpForCurrentLevel = this.totalXpForLevel(currentLevel);
        const totalXpForNextLevel = this.totalXpForLevel(currentLevel + 1);
        return totalXpForNextLevel - currentXp;
    }

    // Calculate current level progress (0-100%)
    getLevelProgress(currentXp) {
        const currentLevel = this.calculateLevel(currentXp);
        const totalXpForCurrentLevel = this.totalXpForLevel(currentLevel);
        const totalXpForNextLevel = this.totalXpForLevel(currentLevel + 1);
        const xpInCurrentLevel = currentXp - totalXpForCurrentLevel;
        const xpRequiredForCurrentLevel = totalXpForNextLevel - totalXpForCurrentLevel;
        
        return Math.floor((xpInCurrentLevel / xpRequiredForCurrentLevel) * 100);
    }

    // Get user data
    getUser(userId, guildId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?');
            return stmt.get(userId, guildId);
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }

    // Create or update user
    upsertUser(userId, guildId, username, xpToAdd = 0) {
        try {
            const existingUser = this.getUser(userId, guildId);

            if (existingUser) {
                // Update existing user
                const newXp = existingUser.xp + xpToAdd;
                const newLevel = this.calculateLevel(newXp);
                const leveledUp = newLevel > existingUser.level;

                const updateStmt = this.db.prepare(`
                    UPDATE users 
                    SET xp = ?, level = ?, username = ?, 
                        updated_at = CURRENT_TIMESTAMP, last_message_time = ?
                    WHERE user_id = ? AND guild_id = ?
                `);

                updateStmt.run(newXp, newLevel, username, Date.now(), userId, guildId);

                return {
                    ...existingUser,
                    xp: newXp,
                    level: newLevel,
                    username,
                    leveledUp
                };
            } else {
                // Create new user
                const initialXp = xpToAdd;
                const initialLevel = this.calculateLevel(initialXp);

                const insertStmt = this.db.prepare(`
                    INSERT INTO users (user_id, guild_id, username, xp, level, last_message_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                insertStmt.run(userId, guildId, username, initialXp, initialLevel, Date.now());

                return {
                    user_id: userId,
                    guild_id: guildId,
                    username,
                    xp: initialXp,
                    level: initialLevel,
                    last_message_time: Date.now(),
                    leveledUp: initialLevel > 1
                };
            }
        } catch (error) {
            console.error('Error upserting user:', error);
            return null;
        }
    }

    // Get leaderboard
    getLeaderboard(guildId, limit = 10) {
        try {
            const stmt = this.db.prepare(`
                SELECT user_id, username, xp, level 
                FROM users 
                WHERE guild_id = ? 
                ORDER BY xp DESC 
                LIMIT ?
            `);
            return stmt.all(guildId, limit);
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    // Get user rank
    getUserRank(userId, guildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) + 1 as rank
                FROM users u1
                WHERE u1.guild_id = ? 
                AND u1.xp > (
                    SELECT u2.xp 
                    FROM users u2 
                    WHERE u2.user_id = ? AND u2.guild_id = ?
                )
            `);
            const result = stmt.get(guildId, userId, guildId);
            return result ? result.rank : null;
        } catch (error) {
            console.error('Error getting user rank:', error);
            return null;
        }
    }

    // Economy methods
    getEconomy(userId, guildId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM economy WHERE user_id = ? AND guild_id = ?');
            return stmt.get(userId, guildId);
        } catch (error) {
            console.error('Error getting economy data:', error);
            return null;
        }
    }

    upsertEconomy(userId, guildId) {
        try {
            const existing = this.getEconomy(userId, guildId);
            
            if (!existing) {
                const insertStmt = this.db.prepare(`
                    INSERT INTO economy (user_id, guild_id, money)
                    VALUES (?, ?, ?)
                `);
                insertStmt.run(userId, guildId, config.gambling?.startingMoney || 1000);
                return this.getEconomy(userId, guildId);
            }
            
            return existing;
        } catch (error) {
            console.error('Error upserting economy:', error);
            return null;
        }
    }

    updateMoney(userId, guildId, amount) {
        try {
            this.upsertEconomy(userId, guildId);
            
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET money = money + ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(amount, userId, guildId);
            
            if (amount > 0) {
                this.updateStats(userId, guildId, 'total_winnings', amount);
            } else if (amount < 0) {
                this.updateStats(userId, guildId, 'total_losses', Math.abs(amount));
            }
            
            return this.getEconomy(userId, guildId);
        } catch (error) {
            console.error('Error updating money:', error);
            return null;
        }
    }

    updateStats(userId, guildId, statType, amount) {
        try {
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET ${statType} = ${statType} + ?, games_played = games_played + 1, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(amount, userId, guildId);
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    claimDaily(userId, guildId) {
        try {
            const economy = this.upsertEconomy(userId, guildId);
            const now = new Date();
            const lastDaily = economy.last_daily ? new Date(economy.last_daily) : null;
            
            // Check if 24 hours have passed
            if (lastDaily && (now - lastDaily) < 24 * 60 * 60 * 1000) {
                const timeLeft = 24 * 60 * 60 * 1000 - (now - lastDaily);
                return { success: false, timeLeft };
            }
            
            // Check if streak continues (claimed within 48 hours)
            let newStreak = 1;
            if (lastDaily && (now - lastDaily) < 48 * 60 * 60 * 1000) {
                newStreak = economy.daily_streak + 1;
            }
            
            const maxStreak = config.gambling?.dailyReward?.maxStreak || 30;
            newStreak = Math.min(newStreak, maxStreak);
            
            const baseAmount = config.gambling?.dailyReward?.baseAmount || 100;
            const streakBonus = config.gambling?.dailyReward?.streakBonus || 50;
            const reward = baseAmount + (streakBonus * (newStreak - 1));
            
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET money = money + ?, daily_streak = ?, last_daily = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(reward, newStreak, now.toISOString(), userId, guildId);
            
            return { 
                success: true, 
                reward, 
                streak: newStreak,
                newBalance: economy.money + reward
            };
        } catch (error) {
            console.error('Error claiming daily:', error);
            return { success: false, error: error.message };
        }
    }

    // Bank methods
    getBankLimit(bankLevel) {
        if (bankLevel === 1) {
            return config.gambling?.bank?.baseBankLimit || 5000;
        }
        const upgradeLimits = config.gambling?.bank?.upgradeLimits || [];
        return upgradeLimits[bankLevel - 2] || config.gambling?.bank?.baseBankLimit || 5000;
    }

    getBankUpgradeCost(currentLevel) {
        const upgradeCosts = config.gambling?.bank?.upgradeCosts || [];
        return upgradeCosts[currentLevel - 1] || null;
    }

    depositMoney(userId, guildId, amount) {
        try {
            const economy = this.upsertEconomy(userId, guildId);
            const bankLimit = this.getBankLimit(economy.bank_level);
            
            if (amount > economy.money) {
                return { success: false, error: 'Insufficient wallet funds' };
            }
            
            if (economy.bank_money + amount > bankLimit) {
                return { success: false, error: 'Bank limit exceeded', bankLimit, currentBank: economy.bank_money };
            }
            
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET money = money - ?, bank_money = bank_money + ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(amount, amount, userId, guildId);
            
            return { success: true, deposited: amount, newWallet: economy.money - amount, newBank: economy.bank_money + amount };
        } catch (error) {
            console.error('Error depositing money:', error);
            return { success: false, error: error.message };
        }
    }

    withdrawMoney(userId, guildId, amount) {
        try {
            const economy = this.upsertEconomy(userId, guildId);
            
            if (amount > economy.bank_money) {
                return { success: false, error: 'Insufficient bank funds' };
            }
            
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET money = money + ?, bank_money = bank_money - ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(amount, amount, userId, guildId);
            
            return { success: true, withdrawn: amount, newWallet: economy.money + amount, newBank: economy.bank_money - amount };
        } catch (error) {
            console.error('Error withdrawing money:', error);
            return { success: false, error: error.message };
        }
    }

    upgradeBankLevel(userId, guildId) {
        try {
            const economy = this.upsertEconomy(userId, guildId);
            const maxLevel = config.gambling?.bank?.maxBankLevel || 7;
            
            if (economy.bank_level >= maxLevel) {
                return { success: false, error: 'Bank already at maximum level' };
            }
            
            const upgradeCost = this.getBankUpgradeCost(economy.bank_level);
            if (!upgradeCost) {
                return { success: false, error: 'No upgrade available' };
            }
            
            if (economy.money < upgradeCost) {
                return { success: false, error: 'Insufficient funds for upgrade', cost: upgradeCost };
            }
            
            const newLevel = economy.bank_level + 1;
            const newLimit = this.getBankLimit(newLevel);
            
            const stmt = this.db.prepare(`
                UPDATE economy 
                SET money = money - ?, bank_level = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            stmt.run(upgradeCost, newLevel, userId, guildId);
            
            return { 
                success: true, 
                newLevel, 
                newLimit, 
                cost: upgradeCost,
                newWallet: economy.money - upgradeCost 
            };
        } catch (error) {
            console.error('Error upgrading bank:', error);
            return { success: false, error: error.message };
        }
    }

    // Steal methods
    canSteal(userId, guildId) {
        try {
            const economy = this.upsertEconomy(userId, guildId);
            const now = new Date();
            const lastSteal = economy.last_steal ? new Date(economy.last_steal) : null;
            const cooldown = config.gambling?.steal?.cooldown || 86400000; // 24 hours
            
            if (lastSteal && (now - lastSteal) < cooldown) {
                const timeLeft = cooldown - (now - lastSteal);
                return { canSteal: false, timeLeft };
            }
            
            return { canSteal: true };
        } catch (error) {
            console.error('Error checking steal cooldown:', error);
            return { canSteal: false, error: error.message };
        }
    }

    attemptSteal(stealerId, targetId, guildId) {
        try {
            const cooldownCheck = this.canSteal(stealerId, guildId);
            if (!cooldownCheck.canSteal) {
                return { success: false, onCooldown: true, timeLeft: cooldownCheck.timeLeft };
            }
            
            const stealer = this.upsertEconomy(stealerId, guildId);
            const target = this.upsertEconomy(targetId, guildId);
            
            // Update stealer's last steal time regardless of success
            const updateStealTime = this.db.prepare(`
                UPDATE economy 
                SET last_steal = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND guild_id = ?
            `);
            updateStealTime.run(new Date().toISOString(), stealerId, guildId);
            
            const successChance = config.gambling?.steal?.successChance || 0.45;
            const success = Math.random() < successChance;
            
            if (!success) {
                return { success: false, caught: true };
            }
            
            // Calculate steal amount (only from wallet, not bank)
            const minAmount = config.gambling?.steal?.minStealAmount || 50;
            const maxPercentage = config.gambling?.steal?.maxStealPercentage || 0.25;
            const maxSteal = Math.floor(target.money * maxPercentage);
            const stealAmount = Math.max(minAmount, Math.min(maxSteal, target.money));
            
            if (stealAmount <= 0) {
                return { success: false, noMoney: true };
            }
            
            // Transfer money
            const transferStmt = this.db.prepare(`
                UPDATE economy 
                SET money = CASE 
                    WHEN user_id = ? THEN money + ?
                    WHEN user_id = ? THEN money - ?
                    ELSE money
                END,
                total_stolen = CASE 
                    WHEN user_id = ? THEN total_stolen + ?
                    ELSE total_stolen
                END,
                total_stolen_from = CASE 
                    WHEN user_id = ? THEN total_stolen_from + ?
                    ELSE total_stolen_from
                END,
                updated_at = CURRENT_TIMESTAMP
                WHERE (user_id = ? OR user_id = ?) AND guild_id = ?
            `);
            
            transferStmt.run(
                stealerId, stealAmount,  // Stealer gains money
                targetId, stealAmount,   // Target loses money
                stealerId, stealAmount,  // Update stealer's total_stolen
                targetId, stealAmount,   // Update target's total_stolen_from
                stealerId, targetId, guildId
            );
            
            return { 
                success: true, 
                stealAmount,
                stealerNewBalance: stealer.money + stealAmount,
                targetNewBalance: target.money - stealAmount
            };
        } catch (error) {
            console.error('Error attempting steal:', error);
            return { success: false, error: error.message };
        }
    }

    getMoneyLeaderboard(guildId, limit = 10) {
        try {
            const stmt = this.db.prepare(`
                SELECT user_id, money + bank_money as total_money, money as wallet_money, bank_money
                FROM economy 
                WHERE guild_id = ? 
                ORDER BY total_money DESC 
                LIMIT ?
            `);
            return stmt.all(guildId, limit);
        } catch (error) {
            console.error('Error getting money leaderboard:', error);
            return [];
        }
    }

    // Event methods
    createEvent(guildId, eventType, eventName, startDate, endDate) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO events (guild_id, event_type, event_name, start_date, end_date)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = stmt.run(guildId, eventType, eventName, startDate, endDate);
            return { success: true, eventId: result.lastInsertRowid };
        } catch (error) {
            console.error('Error creating event:', error);
            return { success: false, error: error.message };
        }
    }

    getActiveEvents(guildId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM events 
                WHERE guild_id = ? AND is_active = 1 AND end_date > datetime('now')
                ORDER BY start_date ASC
            `);
            return stmt.all(guildId);
        } catch (error) {
            console.error('Error getting active events:', error);
            return [];
        }
    }

    getUpcomingEvents(guildId, limit = 5) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM events 
                WHERE guild_id = ? AND start_date > datetime('now')
                ORDER BY start_date ASC
                LIMIT ?
            `);
            return stmt.all(guildId, limit);
        } catch (error) {
            console.error('Error getting upcoming events:', error);
            return [];
        }
    }

    endEvent(eventId) {
        try {
            const stmt = this.db.prepare(`
                UPDATE events 
                SET is_active = 0 
                WHERE id = ?
            `);
            stmt.run(eventId);
            return { success: true };
        } catch (error) {
            console.error('Error ending event:', error);
            return { success: false, error: error.message };
        }
    }

    addEventParticipant(eventId, userId, guildId) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO event_participants 
                (event_id, user_id, guild_id, participation_count)
                VALUES (?, ?, ?, COALESCE((SELECT participation_count FROM event_participants WHERE event_id = ? AND user_id = ? AND guild_id = ?) + 1, 1))
            `);
            stmt.run(eventId, userId, guildId, eventId, userId, guildId);
            return { success: true };
        } catch (error) {
            console.error('Error adding event participant:', error);
            return { success: false, error: error.message };
        }
    }

    giveEventReward(eventId, userId, guildId, coins, items) {
        try {
            const itemsJson = JSON.stringify(items);
            
            // Update participant record
            const updateParticipant = this.db.prepare(`
                UPDATE event_participants 
                SET coins_received = coins_received + ?, 
                    items_received = json_insert(items_received, '$[#]', ?),
                    rewards_claimed = rewards_claimed + 1
                WHERE event_id = ? AND user_id = ? AND guild_id = ?
            `);
            updateParticipant.run(coins, itemsJson, eventId, userId, guildId);
            
            // Update user's economy
            this.updateMoney(userId, guildId, coins);
            
            return { success: true };
        } catch (error) {
            console.error('Error giving event reward:', error);
            return { success: false, error: error.message };
        }
    }

    getEventLeaderboards(guildId) {
        try {
            // Get top robbers (total_stolen)
            const topRobbers = this.db.prepare(`
                SELECT user_id, total_stolen as score FROM economy 
                WHERE guild_id = ? AND total_stolen > 0
                ORDER BY total_stolen DESC 
                LIMIT 3
            `).all(guildId);

            // Get top balance holders (money + bank_money)
            const topBalance = this.db.prepare(`
                SELECT user_id, (money + bank_money) as score FROM economy 
                WHERE guild_id = ?
                ORDER BY (money + bank_money) DESC 
                LIMIT 3
            `).all(guildId);

            // Get top level users
            const topLevel = this.db.prepare(`
                SELECT user_id, level as score FROM users 
                WHERE guild_id = ?
                ORDER BY level DESC, xp DESC 
                LIMIT 3
            `).all(guildId);

            return {
                robbing: topRobbers,
                balance: topBalance,
                level: topLevel
            };
        } catch (error) {
            console.error('Error getting event leaderboards:', error);
            return { robbing: [], balance: [], level: [] };
        }
    }

    // Shop methods
    refreshShopInventory(guildId) {
        try {
            // Clear current shop inventory for this guild
            this.db.prepare(`DELETE FROM shop_inventory WHERE guild_id = ?`).run(guildId);

            const shopConfig = config.shop;
            if (!shopConfig?.enabled) return { success: false, error: 'Shop disabled' };

            const today = new Date().toISOString().split('T')[0];
            const categories = shopConfig.categories;
            
            // Add daily rotating items
            const allItems = [];
            for (const [categoryKey, category] of Object.entries(categories)) {
                for (const [itemKey, item] of Object.entries(category.items)) {
                    allItems.push({
                        id: itemKey,
                        category: categoryKey,
                        ...item
                    });
                }
            }

            // Randomly select daily items
            const shuffledItems = allItems.sort(() => Math.random() - 0.5);
            const dailyItems = shuffledItems.slice(0, shopConfig.dailyItemCount);

            // Add event items if there's an active event
            const activeEvents = this.getActiveEvents(guildId);
            let eventItems = [];
            
            for (const event of activeEvents) {
                const eventType = event.event_type;
                if (shopConfig.eventItems[eventType]) {
                    eventItems = [...eventItems, ...shopConfig.eventItems[eventType]];
                }
            }

            // Limit event items
            eventItems = eventItems.slice(0, shopConfig.eventItemCount);

            // Insert items into shop inventory
            const insertItem = this.db.prepare(`
                INSERT INTO shop_inventory (guild_id, item_id, item_name, item_description, price, category, rarity, effects, is_event_item, event_type, date_added)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Add daily items
            for (const item of dailyItems) {
                const price = Math.floor(item.basePrice * (shopConfig.rarityMultipliers[item.rarity] || 1.0));
                const effects = JSON.stringify(item.effects || []);
                insertItem.run(guildId, item.id, item.name, item.description, price, item.category, item.rarity, effects, 0, null, today);
            }

            // Add event items
            for (const item of eventItems) {
                const price = Math.floor(item.basePrice * (shopConfig.rarityMultipliers[item.rarity] || 1.8));
                const effects = JSON.stringify(item.effects || []);
                const eventType = activeEvents.find(e => shopConfig.eventItems[e.event_type]?.includes(item))?.event_type;
                insertItem.run(guildId, `event_${item.name.replace(/[^\w]/g, '_')}`, item.name, item.description, price, 'event', item.rarity, effects, 1, eventType, today);
            }

            return { success: true, dailyCount: dailyItems.length, eventCount: eventItems.length };
        } catch (error) {
            console.error('Error refreshing shop inventory:', error);
            return { success: false, error: error.message };
        }
    }

    getShopInventory(guildId) {
        try {
            const items = this.db.prepare(`
                SELECT * FROM shop_inventory 
                WHERE guild_id = ? 
                ORDER BY is_event_item DESC, category, rarity, item_name
            `).all(guildId);

            return items;
        } catch (error) {
            console.error('Error getting shop inventory:', error);
            return [];
        }
    }

    purchaseItem(userId, guildId, itemId) {
        try {
            // Get item from shop
            const item = this.db.prepare(`
                SELECT * FROM shop_inventory 
                WHERE guild_id = ? AND item_id = ?
            `).get(guildId, itemId);

            if (!item) {
                return { success: false, error: 'Item not found in shop' };
            }

            // Check if user has enough money
            const economy = this.upsertEconomy(userId, guildId);
            if (economy.money < item.price) {
                return { success: false, error: 'Insufficient funds', needed: item.price - economy.money };
            }

            // Deduct money
            this.updateMoney(userId, guildId, -item.price);

            // Add item to user inventory
            const insertUserItem = this.db.prepare(`
                INSERT INTO user_inventory (user_id, guild_id, item_id, item_name, effects, purchased_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            const effects = JSON.stringify(item.effects || []);
            insertUserItem.run(userId, guildId, item.item_id, item.item_name, effects);

            return { 
                success: true, 
                item: item,
                newBalance: economy.money - item.price
            };
        } catch (error) {
            console.error('Error purchasing item:', error);
            return { success: false, error: error.message };
        }
    }

    getUserInventory(userId, guildId) {
        try {
            const items = this.db.prepare(`
                SELECT * FROM user_inventory 
                WHERE user_id = ? AND guild_id = ? AND is_active = 1
                ORDER BY purchased_at DESC
            `).all(userId, guildId);

            return items.map(item => ({
                ...item,
                effects: JSON.parse(item.effects || '[]')
            }));
        } catch (error) {
            console.error('Error getting user inventory:', error);
            return [];
        }
    }

    useItem(userId, guildId, inventoryId) {
        try {
            // Get item from user inventory
            const item = this.db.prepare(`
                SELECT * FROM user_inventory 
                WHERE id = ? AND user_id = ? AND guild_id = ? AND is_active = 1 AND quantity > 0
            `).get(inventoryId, userId, guildId);

            if (!item) {
                return { success: false, error: 'Item not found in your inventory or already used' };
            }

            // Parse item effects
            const effects = JSON.parse(item.effects || '[]');
            
            // Apply item effects
            const appliedEffects = [];
            let coinsGained = 0;
            
            for (const effect of effects) {
                if (effect === 'instant_coins') {
                    // Golden Apple effect - gain 100-500 coins
                    coinsGained = Math.floor(Math.random() * 401) + 100; // 100-500 coins
                    this.updateMoney(userId, guildId, coinsGained);
                    appliedEffects.push(`Gained ${coinsGained} coins!`);
                } else if (effect.includes('xp_boost')) {
                    appliedEffects.push('XP boost activated (effect system needs implementation)');
                } else if (effect.includes('luck_boost')) {
                    appliedEffects.push('Luck boost activated (effect system needs implementation)');
                } else {
                    appliedEffects.push(`Applied effect: ${effect}`);
                }
            }
            
            // Determine if item is consumable
            const isConsumable = effects.some(effect => 
                effect.includes('instant') || 
                effect.includes('boost') || 
                effect.includes('potion') ||
                effect.includes('drink')
            );
            
            if (isConsumable) {
                // Reduce quantity by 1
                const newQuantity = item.quantity - 1;
                if (newQuantity <= 0) {
                    // Remove item from inventory
                    this.db.prepare(`
                        UPDATE user_inventory 
                        SET is_active = 0, quantity = 0 
                        WHERE id = ?
                    `).run(inventoryId);
                } else {
                    // Just reduce quantity
                    this.db.prepare(`
                        UPDATE user_inventory 
                        SET quantity = ? 
                        WHERE id = ?
                    `).run(newQuantity, inventoryId);
                }
            }

            return { 
                success: true, 
                effects: appliedEffects,
                consumed: isConsumable,
                coinsGained: coinsGained
            };
        } catch (error) {
            console.error('Error using item:', error);
            return { success: false, error: error.message };
        }
    }

    close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('Database connection closed');
            } catch (error) {
                console.error('Error closing database:', error.message);
            }
        }
    }
}