import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fishing configuration
let fishingConfig;
try {
    const configPath = join(__dirname, '../../fishing_config.json');
    fishingConfig = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading fishing_config.json:', error.message);
    throw new Error('Failed to load fishing configuration');
}

/**
 * In-memory fish inventory storage
 * Structure: { userId: { fish: [{ name, value, emoji, rarity, caught_at }], total_value: number } }
 */
const fishInventories = new Map();

/**
 * In-memory bait inventory storage
 * Structure: { userId: { worm: 10, cricket: 5, ... } }
 */
const baitInventories = new Map();

/**
 * User fishing cooldowns
 * Structure: { userId: timestamp }
 */
const fishingCooldowns = new Map();

/**
 * Shop bait stock and reset tracking
 * Structure: { last_reset: timestamp, stock: { bait_type: remaining_count } }
 */
let shopBaitData = {
    last_reset: null,
    stock: {}
};

export class FishingRNG {
    /**
     * Get all fish data organized by rarity
     */
    static getAllFish() {
        const allFish = [];
        Object.values(fishingConfig.fish).forEach(rarityGroup => {
            allFish.push(...rarityGroup);
        });
        return allFish;
    }

    /**
     * Calculate adjusted probabilities based on modifiers
     * @param {string} rodType - Type of fishing rod (wooden, iron, gold, diamond)
     * @param {string} weatherType - Current weather (sunny, cloudy, rainy, stormy, foggy)
     * @param {string} baitType - Type of bait (worm, cricket, minnow, shrimp, squid, magic_lure)
     * @param {boolean} hasLuckPotion - Whether user has luck potion active
     * @returns {Array} Array of fish with adjusted probabilities
     */
    static calculateProbabilities(rodType = 'wooden', weatherType = 'cloudy', baitType = 'worm', hasLuckPotion = false) {
        const allFish = this.getAllFish();
        const rodData = fishingConfig.rods[rodType] || fishingConfig.rods.wooden;
        const weatherData = fishingConfig.weather[weatherType] || fishingConfig.weather.cloudy;
        const baitData = fishingConfig.bait[baitType] || fishingConfig.bait.worm;
        const luckModifier = hasLuckPotion ? fishingConfig.modifiers.luck_potion : null;
        const minChance = fishingConfig.modifiers.minimum_chance;

        // Calculate adjusted probabilities for each fish
        const adjustedFish = allFish.map(fish => {
            let adjustedChance = fish.base_chance;

            // Apply rod modifier based on rarity
            const rodModifier = rodData[`${fish.rarity}_bonus`] || 1.0;
            adjustedChance *= rodModifier;

            // Apply weather modifier based on rarity
            const weatherModifier = weatherData[`${fish.rarity}_bonus`] || 1.0;
            adjustedChance *= weatherModifier;

            // Apply bait modifier based on rarity
            const baitModifier = baitData[`${fish.rarity}_bonus`] || 1.0;
            adjustedChance *= baitModifier;

            // Apply luck potion modifier if active
            if (luckModifier) {
                const luckModifierValue = luckModifier[`${fish.rarity}_bonus`] || 1.0;
                adjustedChance *= luckModifierValue;
            }

            // Ensure minimum chance
            adjustedChance = Math.max(adjustedChance, minChance);

            return {
                ...fish,
                adjusted_chance: adjustedChance
            };
        });

        // Normalize probabilities to ensure they add up to 100%
        const totalProbability = adjustedFish.reduce((sum, fish) => sum + fish.adjusted_chance, 0);
        const normalizedFish = adjustedFish.map(fish => ({
            ...fish,
            normalized_chance: (fish.adjusted_chance / totalProbability) * 100
        }));

        return normalizedFish;
    }

    /**
     * Catch a fish using weighted random selection
     * @param {string} rodType - Type of fishing rod
     * @param {string} weatherType - Current weather
     * @param {string} baitType - Type of bait
     * @param {boolean} hasLuckPotion - Whether user has luck potion active
     * @returns {Object|null} Caught fish object or null if no fish caught
     */
    static catchFish(rodType = 'wooden', weatherType = 'cloudy', baitType = 'worm', hasLuckPotion = false) {
        const fishWithProbabilities = this.calculateProbabilities(rodType, weatherType, baitType, hasLuckPotion);
        
        // Generate random number between 0 and 100
        const randomNum = Math.random() * 100;
        
        // Find which fish was caught using cumulative probability
        let cumulativeProbability = 0;
        for (const fish of fishWithProbabilities) {
            cumulativeProbability += fish.normalized_chance;
            if (randomNum <= cumulativeProbability) {
                return {
                    name: fish.name,
                    rarity: fish.rarity,
                    value: fish.value,
                    emoji: fish.emoji,
                    base_chance: fish.base_chance,
                    adjusted_chance: fish.adjusted_chance,
                    final_chance: fish.normalized_chance,
                    caught_at: new Date().toISOString()
                };
            }
        }
        
        // Fallback to most common fish if something went wrong
        const commonFish = fishingConfig.fish.common[0];
        return {
            name: commonFish.name,
            rarity: commonFish.rarity,
            value: commonFish.value,
            emoji: commonFish.emoji,
            base_chance: commonFish.base_chance,
            adjusted_chance: commonFish.base_chance,
            final_chance: commonFish.base_chance,
            caught_at: new Date().toISOString()
        };
    }

    /**
     * Add fish to user's inventory
     * @param {string} userId - Discord user ID
     * @param {Object} fish - Fish object to add
     */
    static addFishToInventory(userId, fish) {
        if (!fishInventories.has(userId)) {
            fishInventories.set(userId, {
                fish: [],
                total_value: 0
            });
        }

        const userInventory = fishInventories.get(userId);
        userInventory.fish.push(fish);
        userInventory.total_value += fish.value;
        fishInventories.set(userId, userInventory);

        return userInventory;
    }

    /**
     * Get user's fish inventory
     * @param {string} userId - Discord user ID
     * @returns {Object} User's inventory object
     */
    static getUserInventory(userId) {
        return fishInventories.get(userId) || { fish: [], total_value: 0 };
    }

    /**
     * Sell all fish in user's inventory
     * @param {string} userId - Discord user ID
     * @returns {Object} Sale result with total value and fish count
     */
    static sellAllFish(userId) {
        const userInventory = fishInventories.get(userId);
        
        if (!userInventory || userInventory.fish.length === 0) {
            return {
                success: false,
                message: 'No fish to sell!',
                total_value: 0,
                fish_count: 0
            };
        }

        const saleResult = {
            success: true,
            total_value: userInventory.total_value,
            fish_count: userInventory.fish.length,
            fish_sold: [...userInventory.fish] // Copy for sale summary
        };

        // Clear the inventory
        fishInventories.set(userId, { fish: [], total_value: 0 });

        return saleResult;
    }

    /**
     * Check if user is on fishing cooldown
     * @param {string} userId - Discord user ID
     * @returns {Object} Cooldown status and remaining time
     */
    static checkFishingCooldown(userId) {
        const lastFishTime = fishingCooldowns.get(userId) || 0;
        const cooldownTime = fishingConfig.modifiers.base_fishing_cooldown;
        const timeRemaining = (lastFishTime + cooldownTime) - Date.now();

        return {
            onCooldown: timeRemaining > 0,
            timeRemaining: Math.max(0, timeRemaining),
            timeRemainingSeconds: Math.ceil(Math.max(0, timeRemaining) / 1000)
        };
    }

    /**
     * Set fishing cooldown for user
     * @param {string} userId - Discord user ID
     */
    static setFishingCooldown(userId) {
        fishingCooldowns.set(userId, Date.now());
    }

    /**
     * Get fishing rod information
     * @param {string} rodType - Rod type
     * @returns {Object} Rod information
     */
    static getRodInfo(rodType) {
        return fishingConfig.rods[rodType] || fishingConfig.rods.wooden;
    }

    /**
     * Get weather information
     * @param {string} weatherType - Weather type
     * @returns {Object} Weather information
     */
    static getWeatherInfo(weatherType) {
        return fishingConfig.weather[weatherType] || fishingConfig.weather.cloudy;
    }

    /**
     * Get available rod types
     * @returns {Array} Array of available rod types
     */
    static getAvailableRods() {
        return Object.keys(fishingConfig.rods);
    }

    /**
     * Get available weather types
     * @returns {Array} Array of available weather types
     */
    static getAvailableWeather() {
        return Object.keys(fishingConfig.weather);
    }

    /**
     * Get rarity color for embeds
     * @param {string} rarity - Fish rarity
     * @returns {string} Hex color code
     */
    static getRarityColor(rarity) {
        return fishingConfig.rarity_colors[rarity] || fishingConfig.rarity_colors.common;
    }

    /**
     * Get random fishing start message
     * @returns {string} Random fishing message
     */
    static getRandomFishingMessage() {
        const messages = fishingConfig.messages.fishing_start;
        return messages[Math.floor(Math.random() * messages.length)];
    }

    /**
     * Get inventory summary for display
     * @param {string} userId - Discord user ID
     * @returns {Object} Formatted inventory summary
     */
    static getInventorySummary(userId) {
        const inventory = this.getUserInventory(userId);
        
        if (inventory.fish.length === 0) {
            return {
                isEmpty: true,
                message: 'Your fishing net is empty! Go catch some fish with `/fish`!'
            };
        }

        // Group fish by rarity
        const rarityGroups = {};
        inventory.fish.forEach(fish => {
            if (!rarityGroups[fish.rarity]) {
                rarityGroups[fish.rarity] = [];
            }
            rarityGroups[fish.rarity].push(fish);
        });

        // Sort rarities by value (mythic first)
        const rarityOrder = ['mythic', 'legendary', 'rare', 'uncommon', 'common'];
        const sortedGroups = {};
        rarityOrder.forEach(rarity => {
            if (rarityGroups[rarity]) {
                sortedGroups[rarity] = rarityGroups[rarity];
            }
        });

        return {
            isEmpty: false,
            totalFish: inventory.fish.length,
            totalValue: inventory.total_value,
            rarityGroups: sortedGroups,
            rarityColors: fishingConfig.rarity_colors
        };
    }

    /**
     * Initialize user with starting bait
     * @param {string} userId - Discord user ID
     */
    static initializeUserBait(userId) {
        if (!baitInventories.has(userId)) {
            const startingBait = { ...fishingConfig.starting_bait };
            baitInventories.set(userId, startingBait);
            return startingBait;
        }
        return baitInventories.get(userId);
    }

    /**
     * Get user's bait inventory
     * @param {string} userId - Discord user ID
     * @returns {Object} User's bait inventory
     */
    static getUserBait(userId) {
        const bait = baitInventories.get(userId);
        if (!bait) {
            return this.initializeUserBait(userId);
        }
        return bait;
    }

    /**
     * Add bait to user's inventory
     * @param {string} userId - Discord user ID
     * @param {string} baitType - Type of bait to add
     * @param {number} amount - Amount to add
     * @returns {Object} Updated bait inventory
     */
    static addBait(userId, baitType, amount) {
        const currentBait = this.getUserBait(userId);
        currentBait[baitType] = (currentBait[baitType] || 0) + amount;
        baitInventories.set(userId, currentBait);
        return currentBait;
    }

    /**
     * Use bait from user's inventory
     * @param {string} userId - Discord user ID
     * @param {string} baitType - Type of bait to use
     * @param {number} amount - Amount to use (default 1)
     * @returns {Object} Result of bait usage
     */
    static useBait(userId, baitType, amount = 1) {
        const currentBait = this.getUserBait(userId);
        
        if (!currentBait[baitType] || currentBait[baitType] < amount) {
            return {
                success: false,
                message: `Not enough ${fishingConfig.bait[baitType]?.name || baitType}!`,
                current_amount: currentBait[baitType] || 0
            };
        }

        currentBait[baitType] -= amount;
        baitInventories.set(userId, currentBait);
        
        return {
            success: true,
            message: `Used ${amount}x ${fishingConfig.bait[baitType]?.name || baitType}`,
            remaining_amount: currentBait[baitType]
        };
    }

    /**
     * Give daily bait rewards to user
     * @param {string} userId - Discord user ID
     * @returns {Object} Daily bait rewards given
     */
    static giveDailyBait(userId) {
        const dailyBait = fishingConfig.daily_rewards.bait;
        const rewardsGiven = {};

        Object.entries(dailyBait).forEach(([baitType, amount]) => {
            this.addBait(userId, baitType, amount);
            rewardsGiven[baitType] = amount;
        });

        return rewardsGiven;
    }

    /**
     * Get available bait types
     * @returns {Array} Array of available bait types
     */
    static getAvailableBait() {
        return Object.keys(fishingConfig.bait);
    }

    /**
     * Get bait information
     * @param {string} baitType - Bait type
     * @returns {Object} Bait information
     */
    static getBaitInfo(baitType) {
        return fishingConfig.bait[baitType] || fishingConfig.bait.worm;
    }

    /**
     * Check and reset shop bait stock if needed
     * @returns {Object} Shop reset information
     */
    static checkShopBaitReset() {
        const now = Date.now();
        const resetHours = fishingConfig.shop_settings.bait_reset_hours * 60 * 60 * 1000; // Convert to milliseconds
        
        if (!shopBaitData.last_reset || (now - shopBaitData.last_reset) >= resetHours) {
            // Reset shop stock
            shopBaitData.stock = {};
            Object.entries(fishingConfig.bait).forEach(([baitType, baitData]) => {
                if (baitData.shop_stock > 0) {
                    shopBaitData.stock[baitType] = baitData.shop_stock;
                }
            });
            shopBaitData.last_reset = now;
            
            return {
                reset: true,
                next_reset: new Date(now + resetHours).toISOString()
            };
        }
        
        return {
            reset: false,
            next_reset: new Date(shopBaitData.last_reset + resetHours).toISOString()
        };
    }

    /**
     * Get shop bait availability
     * @returns {Object} Available bait in shop with stock
     */
    static getShopBaitStock() {
        this.checkShopBaitReset(); // Ensure stock is current
        
        const availableBait = {};
        Object.entries(fishingConfig.bait).forEach(([baitType, baitData]) => {
            if (baitData.shop_price > 0) {
                availableBait[baitType] = {
                    ...baitData,
                    current_stock: shopBaitData.stock[baitType] || 0
                };
            }
        });
        
        return availableBait;
    }

    /**
     * Purchase bait from shop
     * @param {string} baitType - Type of bait to purchase
     * @param {number} quantity - Quantity to purchase
     * @returns {Object} Purchase result
     */
    static purchaseBait(baitType, quantity = 1) {
        this.checkShopBaitReset();
        
        const baitData = fishingConfig.bait[baitType];
        if (!baitData || baitData.shop_price <= 0) {
            return {
                success: false,
                message: 'This bait is not available for purchase.'
            };
        }
        
        const currentStock = shopBaitData.stock[baitType] || 0;
        if (currentStock < quantity) {
            return {
                success: false,
                message: `Not enough stock! Available: ${currentStock}, Requested: ${quantity}`,
                available_stock: currentStock
            };
        }
        
        const totalCost = baitData.shop_price * quantity;
        
        // Reduce stock
        shopBaitData.stock[baitType] -= quantity;
        
        return {
            success: true,
            bait_type: baitType,
            quantity: quantity,
            total_cost: totalCost,
            remaining_stock: shopBaitData.stock[baitType]
        };
    }

    /**
     * Get bait inventory summary for display
     * @param {string} userId - Discord user ID
     * @returns {Object} Formatted bait inventory summary
     */
    static getBaitSummary(userId) {
        const baitInventory = this.getUserBait(userId);
        const summary = {
            total_bait: 0,
            bait_types: []
        };

        Object.entries(baitInventory).forEach(([baitType, amount]) => {
            if (amount > 0) {
                const baitInfo = fishingConfig.bait[baitType];
                summary.total_bait += amount;
                summary.bait_types.push({
                    type: baitType,
                    name: baitInfo?.name || baitType,
                    emoji: baitInfo?.emoji || '🎣',
                    amount: amount,
                    description: baitInfo?.description || 'Basic bait'
                });
            }
        });

        return summary;
    }

    /**
     * Debug method to get probability distribution with bait
     * @param {string} rodType - Rod type
     * @param {string} weatherType - Weather type
     * @param {string} baitType - Bait type
     * @param {boolean} hasLuckPotion - Luck potion status
     * @returns {Array} Debug information about probabilities
     */
    static debugProbabilities(rodType = 'wooden', weatherType = 'cloudy', baitType = 'worm', hasLuckPotion = false) {
        const fish = this.calculateProbabilities(rodType, weatherType, baitType, hasLuckPotion);
        return fish.map(f => ({
            name: f.name,
            rarity: f.rarity,
            base_chance: f.base_chance.toFixed(2) + '%',
            adjusted_chance: f.adjusted_chance.toFixed(2) + '%',
            final_chance: f.normalized_chance.toFixed(2) + '%'
        }));
    }
}

export default FishingRNG;