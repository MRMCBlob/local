import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { config } from 'dotenv';
import { LevelingDatabase } from './database/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync } from 'fs';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load bot configuration
let botConfig;
try {
    const configPath = join(__dirname, '../config.json');
    botConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    console.log('✅ Loaded config.json successfully');
} catch (error) {
    console.error('❌ Error loading config.json, using defaults:', error.message);
    botConfig = {
        leveling: {
            xpPerMessage: 15,
            xpCooldown: 60000
        },
        roleRewards: {},
        messages: {
            levelUp: {
                title: "🎉 Level Up!",
                color: 65280,
                footer: "Keep chatting to earn more XP!"
            }
        }
    };
}

class LevelingBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.database = new LevelingDatabase(process.env.DATABASE_PATH || './data/leveling.db');
        this.client.commands = new Collection();
        this.userCooldowns = new Map();
        this.config = botConfig;
        
        this.loadCommands();
        this.setupEventHandlers();
        this.startEventScheduler();
    }

    loadCommands() {
        const commandsPath = join(__dirname, 'commands');
        try {
            const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const commandPath = join(commandsPath, file);
                // Convert Windows path to file:// URL for ESM import
                const commandUrl = new URL('file:///' + commandPath.replace(/\\/g, '/'));
                import(commandUrl).then(commandModule => {
                    const command = commandModule.default;
                    if ('data' in command && 'execute' in command) {
                        this.client.commands.set(command.data.name, command);
                        console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.log(`[WARNING] The command at ${commandPath} is missing a required "data" or "execute" property.`);
                    }
                }).catch(error => {
                    console.error(`Error loading command ${file}:`, error);
                });
            }
        } catch (error) {
            console.error('Error loading commands:', error);
        }
    }

    setupEventHandlers() {
        this.client.once(Events.ClientReady, () => {
            console.log(`✅ ${this.client.user.tag} is online!`);
            console.log(`📊 Using XP per message: ${this.config.leveling.xpPerMessage}`);
            console.log(`⏰ XP cooldown: ${this.config.leveling.xpCooldown}ms`);
            
            // Start event scheduler
            this.startEventScheduler();
            console.log(`🎉 Event scheduler started`);
            
            // Start shop scheduler
            this.startShopScheduler();
            console.log(`🏪 Shop scheduler started`);
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (interaction.isChatInputCommand()) {
                const command = this.client.commands.get(interaction.commandName);
                if (!command) {
                    console.error(`No command matching ${interaction.commandName} was found.`);
                    return;
                }

                try {
                    await command.execute(interaction, this.database);
                } catch (error) {
                    console.error('Error executing command:', error);
                    
                    const errorMessage = {
                        content: 'There was an error while executing this command!',
                        ephemeral: true
                    };

                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                }
            } else if (interaction.isStringSelectMenu()) {
                await this.handleSelectMenu(interaction);
            }
        });

        this.client.on(Events.MessageCreate, async (message) => {
            // Handle event participation (only for non-bot users)
            if (!message.author.bot && message.guild) {
                await this.handleEventParticipation(message);
            }
            
            await this.handleLeveling(message);
        });

        this.client.on(Events.Error, error => {
            console.error('Discord client error:', error);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down...');
            this.database.close();
            this.client.destroy();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('Shutting down...');
            this.database.close();
            this.client.destroy();
            process.exit(0);
        });
    }

    async handleLeveling(message) {
        // Ignore bots and DMs
        if (message.author.bot || !message.guild) return;

        const userId = message.author.id;
        const guildId = message.guild.id;
        const username = message.author.username;

        // Check cooldown
        const cooldownKey = `${userId}-${guildId}`;
        const lastMessageTime = this.userCooldowns.get(cooldownKey) || 0;
        const cooldownTime = this.config.leveling.xpCooldown;

        if (Date.now() - lastMessageTime < cooldownTime) {
            return; // User is on cooldown
        }

        this.userCooldowns.set(cooldownKey, Date.now());

        try {
            let xpToAdd = this.config.leveling.xpPerMessage;
            
            // Check if user has booster role for XP multiplier
            if (this.config.leveling.boosterRoleId && message.member) {
                const hasBoosterRole = message.member.roles.cache.has(this.config.leveling.boosterRoleId);
                if (hasBoosterRole) {
                    xpToAdd = Math.floor(xpToAdd * this.config.leveling.boosterXpMultiplier);
                    console.log(`🚀 Booster bonus applied! ${message.author.username} gained ${xpToAdd} XP (${this.config.leveling.boosterXpMultiplier}x multiplier)`);
                }
            }
            
            const result = this.database.upsertUser(userId, guildId, username, xpToAdd);

            if (result && result.leveledUp) {
                await this.handleLevelUp(message, result);
            }

            // Check for active events and give participation rewards
            await this.handleEventParticipation(message);
        } catch (error) {
            console.error('Error handling leveling:', error);
        }
    }

    async handleLevelUp(message, userData) {
        try {
            const newLevel = userData.level;
            
            // Send level up message using config
            const levelUpEmbed = {
                color: this.config.messages.levelUp.color,
                title: this.config.messages.levelUp.title,
                description: `Congratulations ${message.author}! You've reached **Level ${newLevel}**!`,
                thumbnail: {
                    url: message.author.displayAvatarURL()
                },
                timestamp: new Date().toISOString(),
                footer: {
                    text: this.config.messages.levelUp.footer
                }
            };

            // Check if user gets a role reward
            const roleReward = this.config.roleRewards[newLevel.toString()];
            if (roleReward && roleReward.roleId) {
                levelUpEmbed.fields = [{
                    name: '🎁 Role Reward!',
                    value: `You've earned the **${roleReward.name}** role!\n${roleReward.description}`,
                    inline: false
                }];
            }

            // Check if user has booster role and add special message
            if (this.config.leveling.boosterRoleId && message.member && message.member.roles.cache.has(this.config.leveling.boosterRoleId)) {
                if (!levelUpEmbed.fields) levelUpEmbed.fields = [];
                levelUpEmbed.fields.push({
                    name: '🚀 Booster Bonus Active!',
                    value: `You're earning **${this.config.leveling.boosterXpMultiplier}x** XP thanks to your booster role!`,
                    inline: false
                });
            }

            await message.channel.send({ embeds: [levelUpEmbed] });

            // Handle level rewards
            await this.handleLevelRewards(message.member, newLevel);

        } catch (error) {
            console.error('Error handling level up:', error);
        }
    }

    async handleLevelRewards(member, level) {
        try {
            // Use config file for role rewards
            const roleReward = this.config.roleRewards[level.toString()];
            
            if (roleReward && roleReward.roleId) {
                const role = member.guild.roles.cache.get(roleReward.roleId);
                if (role) {
                    await member.roles.add(role);
                    console.log(`✅ Added role "${role.name}" to ${member.user.username} for reaching level ${level}`);
                } else {
                    console.log(`⚠️ Role with ID ${roleReward.roleId} not found for level ${level} reward`);
                }
            }

            // Fallback to environment variable method for compatibility
            const levelRewards = process.env.LEVEL_REWARDS;
            if (levelRewards) {
                const rewards = levelRewards.split(',');
                for (const reward of rewards) {
                    const [rewardLevel, roleId] = reward.split(':');
                    if (parseInt(rewardLevel) === level && roleId) {
                        const role = member.guild.roles.cache.get(roleId.trim());
                        if (role) {
                            await member.roles.add(role);
                            console.log(`✅ Added legacy role ${role.name} to ${member.user.username} for reaching level ${level}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error handling level rewards:', error);
        }
    }

    async handleSelectMenu(interaction) {
        try {
            if (interaction.customId.startsWith('gambling_select_')) {
                const userId = interaction.customId.split('_')[2];
                
                // Check if the user who clicked the menu is the same as who initiated it
                if (interaction.user.id !== userId) {
                    return interaction.reply({
                        content: '❌ This gambling menu is not for you!',
                        ephemeral: true
                    });
                }

                const selectedGame = interaction.values[0];
                
                // Create a follow-up message asking for bet amount
                const gameNames = {
                    'coinflip': '🪙 Coin Flip',
                    'blackjack': '🃏 Blackjack',
                    'poker': '🎰 Poker',
                    'random': '🎲 Random Game'
                };

                const economy = this.database.upsertEconomy(interaction.user.id, interaction.guild.id);
                
                const embed = {
                    color: 0xFFD700,
                    title: '💰 Place Your Bet',
                    description: `You selected **${gameNames[selectedGame]}**\n\n` +
                        `💰 **Your Balance:** ${economy.money} coins\n` +
                        `📊 **Min Bet:** ${this.config.gambling.minBet} coins\n` +
                        `📊 **Max Bet:** ${this.config.gambling.maxBet} coins\n\n` +
                        `Use \`/gambling game:${selectedGame} bet:<amount>\` to place your bet!`,
                    footer: {
                        text: 'Type the command with your bet amount to start playing!'
                    }
                };

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (interaction.customId.startsWith('shop_buy_')) {
                const userId = interaction.customId.split('_')[2];
                
                // Check if the user who clicked the menu is the same as who initiated it
                if (interaction.user.id !== userId) {
                    return interaction.reply({
                        content: '❌ This shop menu is not for you!',
                        ephemeral: true
                    });
                }

                const selectedItemId = interaction.values[0];
                
                // Import and call the shop handler
                const shopCommand = this.client.commands.get('shop');
                if (shopCommand && shopCommand.handlePurchaseFromSelect) {
                    await shopCommand.handlePurchaseFromSelect(interaction, this.database, selectedItemId);
                } else {
                    await interaction.reply({
                        content: '❌ Shop functionality is currently unavailable.',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId.startsWith('shop_inventory_')) {
                const userId = interaction.customId.split('_')[2];
                
                // Check if the user who clicked the menu is the same as who initiated it
                if (interaction.user.id !== userId) {
                    return interaction.reply({
                        content: '❌ This inventory menu is not for you!',
                        ephemeral: true
                    });
                }

                const selectedItemId = interaction.values[0];
                
                // Import and call the shop inventory handler
                const shopCommand = this.client.commands.get('shop');
                if (shopCommand && shopCommand.handleInventoryDetails) {
                    await shopCommand.handleInventoryDetails(interaction, this.database, selectedItemId);
                } else {
                    await interaction.reply({
                        content: '❌ Inventory functionality is currently unavailable.',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId.startsWith('shop_use_')) {
                const userId = interaction.customId.split('_')[2];
                
                // Check if the user who clicked the menu is the same as who initiated it
                if (interaction.user.id !== userId) {
                    return interaction.reply({
                        content: '❌ This use menu is not for you!',
                        ephemeral: true
                    });
                }

                const selectedItemId = interaction.values[0];
                
                // Import and call the shop use handler
                const shopCommand = this.client.commands.get('shop');
                if (shopCommand && shopCommand.handleUseFromSelect) {
                    await shopCommand.handleUseFromSelect(interaction, this.database, selectedItemId);
                } else {
                    await interaction.reply({
                        content: '❌ Use functionality is currently unavailable.',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error handling select menu:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your selection.',
                ephemeral: true
            });
        }
    }

    startEventScheduler() {
        if (!this.config.events?.enabled || !this.config.events?.automaticEvents) {
            return;
        }

        // Check for events every hour
        setInterval(() => {
            this.checkAndStartSeasonalEvents();
        }, 60 * 60 * 1000); // 1 hour

        // Initial check on startup
        setTimeout(() => {
            this.checkAndStartSeasonalEvents();
        }, 10000); // 10 seconds after startup
    }

    async checkAndStartSeasonalEvents() {
        try {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentDay = now.getDate();
            const currentDateStr = `${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

            const eventTypes = this.config.events.eventTypes;
            
            // Check each guild for events
            for (const guild of this.client.guilds.cache.values()) {
                const guildId = guild.id;
                const activeEvents = this.database.getActiveEvents(guildId);

                for (const [eventKey, eventConfig] of Object.entries(eventTypes)) {
                    // Check if this event type is already active
                    const existingEvent = activeEvents.find(e => e.event_type === eventKey);
                    if (existingEvent) continue;

                    // Check if we're in the date range for this event
                    const dates = eventConfig.dates;
                    if (dates && dates.length >= 2) {
                        const startDate = dates[0];
                        const endDate = dates[1];
                        
                        if (this.isDateInRange(currentDateStr, startDate, endDate)) {
                            // Start the event
                            const startDateTime = new Date();
                            const endDateTime = new Date(startDateTime.getTime() + (eventConfig.duration * 24 * 60 * 60 * 1000));
                            
                            const result = this.database.createEvent(
                                guildId, 
                                eventKey, 
                                eventConfig.name, 
                                startDateTime.toISOString(), 
                                endDateTime.toISOString()
                            );

                            if (result.success) {
                                console.log(`🎉 Auto-started ${eventConfig.name} in guild ${guild.name}`);
                                await this.sendEventAnnouncement(guild, eventConfig, startDateTime, endDateTime, 'start');
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking seasonal events:', error);
        }
    }

    isDateInRange(currentDate, startDate, endDate) {
        const current = currentDate.replace('-', '');
        const start = startDate.replace('-', '');
        const end = endDate.replace('-', '');
        
        if (start <= end) {
            return current >= start && current <= end;
        } else {
            // Spans year boundary (like Dec-Jan)
            return current >= start || current <= end;
        }
    }

    async sendEventAnnouncement(guild, eventConfig, startDate, endDate, type) {
        const eventChannelId = this.config.events.eventChannelId;
        const eventRoleId = this.config.events.eventRoleId;

        if (!eventChannelId) return;

        try {
            const eventChannel = await guild.channels.fetch(eventChannelId);
            if (!eventChannel) return;

            const embed = {
                title: type === 'start' ? `🎉 ${eventConfig.name} Started!` : `📅 ${eventConfig.name} Ended!`,
                description: type === 'start' ? 
                    `${eventConfig.description}\n\n` +
                    `🏁 **Ends:** <t:${Math.floor(endDate.getTime() / 1000)}:R>\n\n` +
                    `🎁 **Participation Rewards:**\n` +
                    `💰 ${eventConfig.rewards.participation.coins[0]}-${eventConfig.rewards.participation.coins[1]} coins\n` +
                    `🎯 Random items: ${eventConfig.rewards.participation.items.slice(0, 3).join(' ')}\n\n` +
                    `🏆 **Leaderboard Rewards for top 3:**\n` +
                    `🥷 Robbing: ${eventConfig.rewards.leaderboard.robbing.join('/')} coins\n` +
                    `💰 Balance: ${eventConfig.rewards.leaderboard.balance.join('/')} coins\n` +
                    `📈 Level: ${eventConfig.rewards.leaderboard.level.join('/')} coins\n\n` +
                    `📅 Use \`/calendar\` to see all events!` :
                    `Thank you for participating in **${eventConfig.name}**!\n\n` +
                    `Final rewards will be distributed to top performers soon.`,
                color: parseInt(eventConfig.color.replace('#', ''), 16),
                timestamp: new Date().toISOString()
            };

            const content = eventRoleId ? `<@&${eventRoleId}>` : '';
            
            await eventChannel.send({
                content,
                embeds: [embed]
            });
        } catch (error) {
            console.error('Error sending event announcement:', error);
        }
    }

    async handleEventParticipation(message) {
        if (!this.config.events?.enabled) return;

        try {
            const guildId = message.guild.id;
            const userId = message.author.id;
            const activeEvents = this.database.getActiveEvents(guildId);

            for (const event of activeEvents) {
                // Add user as participant
                this.database.addEventParticipant(event.id, userId, guildId);

                // Random chance to give participation reward (5% chance per message)
                if (Math.random() < 0.05) {
                    const eventConfig = this.config.events.eventTypes[event.event_type];
                    if (eventConfig) {
                        const rewards = eventConfig.rewards.participation;
                        const minCoins = rewards.coins[0];
                        const maxCoins = rewards.coins[1];
                        const randomCoins = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;
                        const randomItem = rewards.items[Math.floor(Math.random() * rewards.items.length)];

                        // Give reward
                        this.database.giveEventReward(event.id, userId, guildId, randomCoins, [randomItem]);

                        // Send reward notification
                        const rewardEmbed = {
                            title: '🎁 Event Reward!',
                            description: `You received a **${event.event_name}** participation reward!\n\n` +
                                `💰 **Coins:** +${randomCoins}\n` +
                                `🎯 **Item:** ${randomItem}`,
                            color: parseInt(eventConfig.color.replace('#', ''), 16),
                            footer: {
                                text: 'Keep participating for more rewards!'
                            }
                        };

                        try {
                            await message.channel.send({
                                content: `${message.author}`,
                                embeds: [rewardEmbed]
                            });
                        } catch (error) {
                            console.error('Error sending reward notification:', error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error handling event participation:', error);
        }
    }

    startShopScheduler() {
        if (!this.config.shop?.enabled) {
            return;
        }

        // Check for shop refresh every hour
        setInterval(() => {
            this.checkAndRefreshShops();
        }, 60 * 60 * 1000); // 1 hour

        // Initial shop setup on startup
        setTimeout(() => {
            this.checkAndRefreshShops();
        }, 15000); // 15 seconds after startup
    }

    async checkAndRefreshShops() {
        try {
            const now = new Date();
            const refreshTime = this.config.shop.refreshTime || "00:00";
            const [hour, minute] = refreshTime.split(':').map(Number);
            
            // Check if it's time to refresh (allow 1 hour window)
            const isRefreshTime = now.getHours() === hour && now.getMinutes() >= minute && now.getMinutes() < minute + 60;
            
            if (isRefreshTime) {
                // Refresh shop for all guilds
                for (const guild of this.client.guilds.cache.values()) {
                    const result = this.database.refreshShopInventory(guild.id);
                    if (result.success) {
                        console.log(`🏪 Refreshed shop for guild ${guild.name} - Daily: ${result.dailyCount}, Event: ${result.eventCount}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking shop refresh:', error);
        }
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            console.error('Error starting bot:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new LevelingBot();
bot.start();