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
    console.error('Error loading config.json in steal command:', error.message);
    config = { gambling: { steal: { enabled: false } } };
}

export const data = new SlashCommandBuilder()
    .setName('steal')
    .setDescription('Attempt to steal coins from a random user (24h cooldown)')
    .addUserOption(option =>
        option.setName('target')
            .setDescription('User to steal from (optional - random if not specified)')
            .setRequired(false));

export async function execute(interaction, database) {
    if (!config.gambling?.steal?.enabled) {
        return interaction.reply({
            content: '🚫 Stealing is currently disabled.',
            ephemeral: true
        });
    }

    const stealerId = interaction.user.id;
    const guildId = interaction.guild.id;
    const targetUser = interaction.options.getUser('target');

    try {
        // Check if user can steal
        const cooldownCheck = database.canSteal(stealerId, guildId);
        if (!cooldownCheck.canSteal) {
            const hours = Math.floor(cooldownCheck.timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((cooldownCheck.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            
            const embed = new EmbedBuilder()
                .setTitle('⏰ Steal on Cooldown')
                .setDescription(`You've already attempted a steal recently!\n\n` +
                    `⏳ **Time Left:** ${hours}h ${minutes}m\n` +
                    `🔄 **Come back later to attempt another steal!**`)
                .setColor('#FF6B6B')
                .setFooter({ text: 'Steal cooldown is 24 hours' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let targetId = targetUser?.id;
        
        // If no target specified, pick a random user with money
        if (!targetId) {
            // Get all users with money in this guild
            const potentialTargets = database.db.prepare(`
                SELECT user_id FROM economy 
                WHERE guild_id = ? AND user_id != ? AND money > ? 
                ORDER BY RANDOM() LIMIT 1
            `).all(guildId, stealerId, config.gambling.steal.minStealAmount || 50);
            
            if (potentialTargets.length === 0) {
                return interaction.reply({
                    content: '❌ No suitable targets found! Everyone is too poor or has their money safely banked.',
                    ephemeral: true
                });
            }
            
            targetId = potentialTargets[0].user_id;
        }

        // Prevent stealing from yourself
        if (targetId === stealerId) {
            return interaction.reply({
                content: '❌ You cannot steal from yourself!',
                ephemeral: true
            });
        }

        // Attempt the steal
        const result = database.attemptSteal(stealerId, targetId, guildId);
        
        if (!result.success) {
            if (result.onCooldown) {
                const hours = Math.floor(result.timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((result.timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                
                const embed = new EmbedBuilder()
                    .setTitle('⏰ Steal on Cooldown')
                    .setDescription(`⏳ **Time Left:** ${hours}h ${minutes}m`)
                    .setColor('#FF6B6B');

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            if (result.caught) {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 Steal Failed!')
                    .setDescription(`You attempted to steal but got caught!\n\n` +
                        `🔍 **Better luck next time!**\n` +
                        `⏰ **Cooldown:** 24 hours`)
                    .setColor('#FF6B6B')
                    .setFooter({ text: `Success rate: ${config.gambling.steal.successChance * 100}%` });

                return interaction.reply({ embeds: [embed] });
            }
            
            if (result.noMoney) {
                const embed = new EmbedBuilder()
                    .setTitle('💸 Target Too Poor')
                    .setDescription(`Your target doesn't have enough money to steal!\n\n` +
                        `⏰ **Cooldown:** 24 hours (still applies)`)
                    .setColor('#FFAA00');

                return interaction.reply({ embeds: [embed] });
            }
            
            return interaction.reply({
                content: `❌ Steal failed: ${result.error || 'Unknown error'}`,
                ephemeral: true
            });
        }

        // Success!
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        const targetName = targetMember?.displayName || 'Unknown User';
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Steal Successful!')
            .setDescription(
                `🎯 **Target:** ${targetName}\n` +
                `💸 **Stolen:** ${result.stealAmount} coins\n` +
                `💳 **Your New Balance:** ${result.stealerNewBalance} coins\n\n` +
                `🏦 **Pro Tip:** Keep your money safe in the bank with \`/bank\`!`
            )
            .setColor('#00FF7F')
            .setFooter({ text: 'Next steal available in 24 hours' });

        return interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in steal command:', error);
        return interaction.reply({
            content: '❌ An error occurred while attempting to steal.',
            ephemeral: true
        });
    }
}

export default {
    data,
    execute
};