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
    console.error('Error loading config.json in daily command:', error.message);
    config = { gambling: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward and maintain your streak!');

export async function execute(interaction, database) {
    if (!config.gambling?.enabled) {
        return interaction.reply({
            content: '🚫 Daily rewards are currently disabled.',
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        const result = database.claimDaily(userId, guildId);

        if (!result.success) {
            if (result.timeLeft) {
                const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                
                const embed = new EmbedBuilder()
                    .setTitle('⏰ Daily Reward Already Claimed')
                    .setDescription(`You've already claimed your daily reward today!\n\n` +
                        `⏳ **Time Left:** ${hours}h ${minutes}m\n` +
                        `🔄 **Come back tomorrow for your next reward!**`)
                    .setColor('#FF6B6B')
                    .setFooter({ text: 'Daily rewards reset every 24 hours' });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            return interaction.reply({
                content: `❌ Error claiming daily reward: ${result.error || 'Unknown error'}`,
                ephemeral: true
            });
        }

        const { reward, streak, newBalance } = result;
        const baseAmount = config.gambling.dailyReward.baseAmount;
        const streakBonus = (reward - baseAmount);
        const maxStreak = config.gambling.dailyReward.maxStreak;

        const embed = new EmbedBuilder()
            .setTitle('🎁 Daily Reward Claimed!')
            .setDescription(
                `💰 **Reward:** ${reward} coins\n` +
                `🔥 **Current Streak:** ${streak} day${streak !== 1 ? 's' : ''}\n` +
                `💳 **New Balance:** ${newBalance} coins\n\n` +
                `💎 **Base Reward:** ${baseAmount} coins\n` +
                (streakBonus > 0 ? `🔥 **Streak Bonus:** +${streakBonus} coins\n` : '') +
                `📈 **Max Streak:** ${maxStreak} days`
            )
            .setColor('#00FF7F')
            .setFooter({ text: 'Come back tomorrow to continue your streak!' });

        // Add streak milestone messages
        if (streak === 7) {
            embed.addFields({ 
                name: '🎉 Weekly Milestone!', 
                value: 'You\'ve maintained a 7-day streak!', 
                inline: false 
            });
        } else if (streak === 30) {
            embed.addFields({ 
                name: '👑 Maximum Streak!', 
                value: 'You\'ve reached the maximum streak bonus!', 
                inline: false 
            });
        }

        return interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in daily command:', error);
        return interaction.reply({
            content: '❌ An error occurred while claiming your daily reward.',
            ephemeral: true
        });
    }
}

export default {
    data,
    execute
};