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
    console.error('Error loading config.json in help command:', error.message);
    config = { messages: { help: {} } };
}

export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help and information about bot commands and features');

export async function execute(interaction) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Help & Commands')
            .setColor(config.messages?.help?.color || 0x00AE86)
            .setDescription('Here are all the available commands and features!')
            .setTimestamp();

        // Core Commands
        embed.addFields({
            name: '🎮 **Core Commands**',
            value: 
                '`/level` - Check your level and XP progress\n' +
                '`/leaderboard` - View the server\'s XP rankings\n' +
                '`/help` - Show this help message\n' +
                '`/calendar` - View active and upcoming events',
            inline: false
        });

        // Economy Commands  
        embed.addFields({
            name: '💰 **Economy Commands**',
            value:
                '`/balance` - Check your coins and view leaderboards\n' +
                '`/daily` - Claim your daily coin reward\n' +
                '`/gambling` - Play various gambling games\n' +
                '`/steal` - Attempt to steal from other users (24h cooldown)\n' +
                '`/bank` - Manage your secure savings account\n' +
                '`/shop` - Interactive shop with select menus for easy buying',
            inline: false
        });

        // Event Commands
        if (config.events?.enabled) {
            embed.addFields({
                name: '🎉 **Event Commands**',
                value:
                    '`/calendar` - View current and upcoming seasonal events',
                inline: false
            });
        }

        // Leveling System Info
        embed.addFields({
            name: '📈 **Leveling System**',
            value:
                `• Gain **${config.leveling?.xpPerMessage || 15} XP** per message\n` +
                `• **${config.leveling?.xpCooldown / 1000 || 10} second** cooldown between XP gains\n` +
                '• Unlock special roles at levels 10, 20, 30, 40, and 50\n' +
                '• Get booster role for 2x XP multiplier!',
            inline: false
        });

        // Economy System Info
        if (config.gambling?.enabled) {
            embed.addFields({
                name: '🎰 **Economy System**',
                value:
                    `• Start with **${config.gambling.startingMoney}** coins\n` +
                    `• Daily rewards: **${config.gambling.dailyReward.baseAmount}** base + streak bonus\n` +
                    '• Play games: Coin Flip, Blackjack, Poker\n' +
                    '• Steal from others with 45% success rate\n' +
                    '• Secure your coins in the bank system',
                inline: false
            });
        }

        // Event System Info
        if (config.events?.enabled) {
            embed.addFields({
                name: '🎊 **Event System**',
                value:
                    '• Seasonal events: Easter, Christmas, Halloween, etc.\n' +
                    '• Participate by chatting during events\n' +
                    '• Random participation rewards (coins & items)\n' +
                    '• Top 3 leaderboard rewards in each category\n' +
                    '• Events start automatically based on calendar dates',
                inline: false
            });
        }

        // Tips & Tricks
        const tips = config.messages?.botMention?.tips || [
            "💡 Use `/level` to check your current level and XP progress!",
            "📊 Use `/leaderboard` to see who's leading in XP on this server!",
            "🚀 Send messages to gain XP and level up!",
            "🎯 Each level requires exponentially more XP!",
            "🏆 Reach milestone levels to unlock special role rewards!",
            "🎮 Keep chatting and engaging with the community!"
        ];

        const randomTips = tips.slice(0, 4); // Show first 4 tips
        embed.addFields({
            name: '💡 **Tips & Tricks**',
            value: randomTips.join('\n'),
            inline: false
        });

        embed.setFooter({
            text: 'Need more help? Ask an admin or moderator!'
        });

        await interaction.reply({
            embeds: [embed],
            flags: 64 // EPHEMERAL flag
        });

    } catch (error) {
        console.error('Error in help command:', error);
        await interaction.reply({
            content: '❌ An error occurred while loading help information.',
            flags: 64 // EPHEMERAL flag
        });
    }
}

export default {
    data,
    execute
};