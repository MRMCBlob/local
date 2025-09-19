import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the server\'s XP leaderboard')
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Number of users to display (1-25)')
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        ),

    async execute(interaction, database) {
        const limit = interaction.options.getInteger('limit') || 10;
        const guildId = interaction.guild.id;

        try {
            await interaction.deferReply();

            // Get leaderboard data
            const leaderboard = database.getLeaderboard(guildId, limit);

            if (!leaderboard || leaderboard.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('📊 Leaderboard')
                    .setDescription('No users found! Start chatting to appear on the leaderboard!')
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create leaderboard text
            let leaderboardText = '';
            const medals = ['🥇', '🥈', '🥉'];

            for (let i = 0; i < leaderboard.length; i++) {
                const user = leaderboard[i];
                const position = i + 1;
                const medal = medals[i] || `**${position}.**`;
                
                // Try to get the user from Discord to get updated username
                let displayName = user.username;
                try {
                    const discordUser = await interaction.client.users.fetch(user.user_id);
                    displayName = discordUser.username;
                } catch (error) {
                    // Use stored username if user can't be fetched
                }

                leaderboardText += `${medal} **${displayName}**\n`;
                leaderboardText += `   Level ${user.level} • ${user.xp.toLocaleString()} XP\n\n`;
            }

            // Get user's position if they're not in the top results
            const userData = database.getUser(interaction.user.id, guildId);
            let userPosition = '';
            
            if (userData) {
                const rank = database.getUserRank(interaction.user.id, guildId);
                if (rank > limit) {
                    userPosition = `\n**Your Position:** #${rank} • Level ${userData.level} • ${userData.xp.toLocaleString()} XP`;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`📊 ${interaction.guild.name} Leaderboard`)
                .setDescription(leaderboardText + userPosition)
                .setTimestamp()
                .setFooter({
                    text: `Showing top ${leaderboard.length} users`,
                    iconURL: interaction.guild.iconURL()
                });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in leaderboard command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Error')
                .setDescription('Something went wrong while fetching the leaderboard!')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};