import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    const configPath = join(__dirname, '../../config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json for level command:', error.message);
    config = {
        messages: {
            level: {
                color: 255,
                noDataTitle: "❌ No Data Found",
                errorTitle: "❌ Error"
            }
        }
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your level or another user\'s level')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to check (leave empty for yourself)')
                .setRequired(false)
        ),

    async execute(interaction, database) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;

        try {
            await interaction.deferReply();

            // Get user data from database
            const userData = database.getUser(targetUser.id, guildId);

            if (!userData) {
                const embed = new EmbedBuilder()
                    .setColor(config.messages.level.color)
                    .setTitle(config.messages.level.noDataTitle)
                    .setDescription(`${targetUser.username} hasn't sent any messages yet!`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Calculate detailed progress information
            const currentLevel = userData.level;
            const currentXp = userData.xp;
            const totalXpForCurrentLevel = database.totalXpForLevel(currentLevel);
            const totalXpForNextLevel = database.totalXpForLevel(currentLevel + 1);
            const xpInCurrentLevel = currentXp - totalXpForCurrentLevel;
            const xpRequiredForNextLevel = totalXpForNextLevel - totalXpForCurrentLevel;
            const xpNeededForNextLevel = database.xpNeededForNextLevel(currentXp);
            const progressPercentage = database.getLevelProgress(currentXp);

            // Get user rank
            const rank = database.getUserRank(targetUser.id, guildId);

            // Create progress bar
            const progressBarLength = 20;
            const filledLength = Math.floor((progressPercentage / 100) * progressBarLength);
            const emptyLength = progressBarLength - filledLength;
            const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

            // Create embed with enhanced information
            const embed = new EmbedBuilder()
                .setColor(config.messages.level.color)
                .setTitle(`📊 ${targetUser.username}'s Level`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    {
                        name: '🏆 Rank',
                        value: `#${rank || 'N/A'}`,
                        inline: true
                    },
                    {
                        name: '📈 Level',
                        value: `${currentLevel}`,
                        inline: true
                    },
                    {
                        name: '✨ Total XP',
                        value: `${currentXp.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '📊 Level Progress',
                        value: `\`\`\`${progressBar}\`\`\`\n${progressPercentage}% (${xpInCurrentLevel.toLocaleString()}/${xpRequiredForNextLevel.toLocaleString()} XP)`,
                        inline: false
                    },
                    {
                        name: '🎯 XP Needed for Next Level',
                        value: `${xpNeededForNextLevel.toLocaleString()} XP`,
                        inline: true
                    },
                    {
                        name: '🔥 XP Required for Level ' + (currentLevel + 1),
                        value: `${database.xpRequiredForLevel(currentLevel + 1).toLocaleString()} XP`,
                        inline: true
                    },
                    {
                        name: '📈 Total XP for Level ' + (currentLevel + 1),
                        value: `${totalXpForNextLevel.toLocaleString()} XP`,
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Check if target user has booster role
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                const configPath = join(__dirname, '../../config.json');
                const botConfig = JSON.parse(readFileSync(configPath, 'utf8'));
                
                if (botConfig.leveling.boosterRoleId && member.roles.cache.has(botConfig.leveling.boosterRoleId)) {
                    embed.addFields({
                        name: '🚀 Booster Status',
                        value: `**Active!** Earning ${botConfig.leveling.boosterXpMultiplier}x XP`,
                        inline: true
                    });
                }
            } catch (error) {
                // Silently ignore if we can't fetch member or config
            }

            // Add special message if checking own level
            if (targetUser.id === interaction.user.id) {
                embed.setDescription('Here are your current stats! Keep chatting to earn more XP! 💪');
            } else {
                embed.setDescription(`Here are ${targetUser.username}'s stats! 📈`);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in level command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(config.messages.level.errorTitle)
                .setDescription('Something went wrong while fetching level data!')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};