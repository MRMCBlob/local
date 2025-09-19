import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    const configPath = join(__dirname, '../../config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json in balance command:', error.message);
    config = { gambling: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance and gambling statistics')
    .addSubcommand(subcommand =>
        subcommand
            .setName('me')
            .setDescription('Check your own balance'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('user')
            .setDescription('Check another user\'s balance')
            .addUserOption(option =>
                option.setName('target')
                    .setDescription('User to check balance for')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('leaderboard')
            .setDescription('Show the richest users in the server')
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Number of users to show (max 15)')
                    .setMinValue(1)
                    .setMaxValue(15)));

export async function execute(interaction, database) {
    if (!config.gambling?.enabled) {
        return interaction.reply({
            content: '🚫 Economy system is currently disabled.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
        switch (subcommand) {
            case 'me':
                return await handleUserBalance(interaction, database, interaction.user);
            
            case 'user':
                const targetUser = interaction.options.getUser('target');
                return await handleUserBalance(interaction, database, targetUser);
            
            case 'leaderboard':
                const limit = interaction.options.getInteger('limit') || 10;
                return await handleLeaderboard(interaction, database, limit);
            
            default:
                return interaction.reply({
                    content: '❌ Invalid balance operation.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in balance command:', error);
        return interaction.reply({
            content: '❌ An error occurred while fetching balance information.',
            ephemeral: true
        });
    }
}

async function handleUserBalance(interaction, database, targetUser) {
    const userId = targetUser.id;
    const guildId = interaction.guild.id;
    const isOwnBalance = targetUser.id === interaction.user.id;

    // Get economy data
    const economy = database.upsertEconomy(userId, guildId);
    
    if (!economy) {
        return interaction.reply({
            content: '❌ Error accessing account data.',
            ephemeral: true
        });
    }

    // Calculate win/loss ratio
    const totalGames = economy.games_played;
    const winRate = totalGames > 0 ? 
        ((economy.total_winnings / (economy.total_winnings + economy.total_losses)) * 100).toFixed(1) : 
        0;

    // Calculate net profit/loss
    const netProfit = economy.total_winnings - economy.total_losses;
    const totalMoney = economy.money + economy.bank_money;

    // Check daily streak info
    const lastDaily = economy.last_daily ? new Date(economy.last_daily) : null;
    const now = new Date();
    const canClaimDaily = !lastDaily || (now - lastDaily) >= 24 * 60 * 60 * 1000;
    
    const embed = new EmbedBuilder()
        .setTitle(`💰 ${isOwnBalance ? 'Your' : `${targetUser.displayName}'s`} Balance`)
        .setDescription(
            `💳 **Wallet:** ${economy.money} coins\n` +
            `🏦 **Bank:** ${economy.bank_money} coins\n` +
            `💎 **Total Wealth:** ${totalMoney} coins`
        )
        .addFields(
            {
                name: '📊 Statistics',
                value: 
                    `🎮 **Games Played:** ${totalGames}\n` +
                    `🏆 **Total Winnings:** ${economy.total_winnings} coins\n` +
                    `💸 **Total Losses:** ${economy.total_losses} coins\n` +
                    `📈 **Net Profit:** ${netProfit >= 0 ? '+' : ''}${netProfit} coins\n` +
                    `🎯 **Win Rate:** ${winRate}%`,
                inline: true
            },
            {
                name: '🔥 Daily Streak',
                value: 
                    `📅 **Current Streak:** ${economy.daily_streak} day${economy.daily_streak !== 1 ? 's' : ''}\n` +
                    `${isOwnBalance && canClaimDaily ? '✅ **Daily Available!**' : '⏰ Daily Claimed'}\n` +
                    `💎 **Next Reward:** ${config.gambling.dailyReward.baseAmount + (config.gambling.dailyReward.streakBonus * economy.daily_streak)} coins`,
                inline: true
            }
        );

    // Add stealing stats if they exist
    if (economy.total_stolen > 0 || economy.total_stolen_from > 0) {
        embed.addFields({
            name: '🥷 Stealing Stats',
            value: 
                `💰 **Total Stolen:** ${economy.total_stolen} coins\n` +
                `💸 **Stolen From You:** ${economy.total_stolen_from} coins\n` +
                `📊 **Net Stolen:** ${economy.total_stolen - economy.total_stolen_from >= 0 ? '+' : ''}${economy.total_stolen - economy.total_stolen_from} coins`,
            inline: false
        });
    }

    embed.setColor(netProfit >= 0 ? '#00FF7F' : '#FF6B6B')
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ 
            text: isOwnBalance && canClaimDaily ? 
                'Use /daily to claim your daily reward!' : 
                `Account created: ${new Date(economy.created_at).toLocaleDateString()}`
        });

    // Add special badges based on performance
    if (economy.daily_streak >= 7 || totalMoney >= 5000) {
        embed.addFields({
            name: '🏅 Achievements',
            value: getAchievements(economy),
            inline: false
        });
    }

    return interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction, database, limit) {
    const guildId = interaction.guild.id;
    
    const leaderboard = database.getMoneyLeaderboard(guildId, limit);
    
    if (leaderboard.length === 0) {
        return interaction.reply({
            content: '📊 No economy data found for this server yet!',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('💰 Richest Members')
        .setColor('#FFD700')
        .setFooter({ text: `Showing top ${leaderboard.length} members` });

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
        
        try {
            const user = await interaction.client.users.fetch(entry.user_id);
            const displayName = user.displayName || user.username;
            
            description += `${medal} **${displayName}**\n`;
            description += `   💎 Total: ${entry.total_money} coins\n`;
            description += `   💳 Wallet: ${entry.wallet_money} | 🏦 Bank: ${entry.bank_money}\n\n`;
        } catch (error) {
            // User not found, skip
            continue;
        }
    }

    if (description === '') {
        return interaction.reply({
            content: '❌ Could not fetch user information for the leaderboard.',
            ephemeral: true
        });
    }

    embed.setDescription(description);
    
    return interaction.reply({ embeds: [embed] });
}

function getAchievements(economy) {
    const achievements = [];
    
    // Streak achievements
    if (economy.daily_streak >= 30) {
        achievements.push('👑 **Streak Master** - 30+ day streak');
    } else if (economy.daily_streak >= 14) {
        achievements.push('🔥 **Dedicated** - 14+ day streak');
    } else if (economy.daily_streak >= 7) {
        achievements.push('⭐ **Consistent** - 7+ day streak');
    }
    
    // Money achievements
    if (economy.money >= 50000) {
        achievements.push('💎 **High Roller** - 50,000+ coins');
    } else if (economy.money >= 10000) {
        achievements.push('💰 **Rich** - 10,000+ coins');
    } else if (economy.money >= 5000) {
        achievements.push('🪙 **Well Off** - 5,000+ coins');
    }
    
    // Game achievements
    if (economy.games_played >= 100) {
        achievements.push('🎮 **Veteran Gambler** - 100+ games');
    } else if (economy.games_played >= 50) {
        achievements.push('🎯 **Regular Player** - 50+ games');
    }
    
    // Profit achievements
    const netProfit = economy.total_winnings - economy.total_losses;
    if (netProfit >= 10000) {
        achievements.push('📈 **Profit King** - 10,000+ net profit');
    } else if (netProfit >= 5000) {
        achievements.push('💹 **Successful Trader** - 5,000+ net profit');
    }
    
    return achievements.length > 0 ? achievements.join('\n') : 'No achievements yet - keep playing!';
}

export default {
    data,
    execute
};