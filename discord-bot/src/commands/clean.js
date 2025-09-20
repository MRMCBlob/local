import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('clean')
    .setDescription('Delete messages from the current channel (Admin only)')
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Only delete messages from this specific user (optional)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for cleaning messages (optional)')
            .setRequired(false)
            .setMaxLength(512));

export async function execute(interaction) {
    // Double-check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: '❌ You need Administrator permissions to use this command.',
            flags: 64 // EPHEMERAL
        });
    }

    // Check if bot has necessary permissions
    const botPermissions = interaction.guild.members.me.permissions;
    if (!botPermissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
            content: '❌ I need the "Manage Messages" permission to delete messages.',
            flags: 64 // EPHEMERAL
        });
    }

    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
        // Defer reply since this might take a moment
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        
        // Fetch messages
        let messagesToDelete = [];
        
        if (targetUser) {
            // If targeting specific user, fetch more messages to filter
            const fetchLimit = Math.min(amount * 5, 100); // Fetch more to account for filtering
            const messages = await channel.messages.fetch({ limit: fetchLimit });
            
            // Filter messages by user
            const userMessages = messages.filter(msg => 
                msg.author.id === targetUser.id && 
                msg.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000 // Only messages newer than 14 days
            );
            
            messagesToDelete = Array.from(userMessages.values()).slice(0, amount);
        } else {
            // Delete any messages
            const messages = await channel.messages.fetch({ limit: amount });
            
            // Filter out messages older than 14 days (Discord limitation)
            messagesToDelete = Array.from(messages.values()).filter(msg => 
                msg.createdTimestamp > Date.now() - 14 * 24 * 60 * 60 * 1000
            );
        }

        if (messagesToDelete.length === 0) {
            return interaction.editReply({
                content: targetUser 
                    ? `❌ No messages found from ${targetUser.username} in the last 14 days.`
                    : '❌ No messages found to delete (messages older than 14 days cannot be bulk deleted).'
            });
        }

        // Delete messages
        let deletedCount = 0;
        
        if (messagesToDelete.length === 1) {
            // Single message deletion
            await messagesToDelete[0].delete();
            deletedCount = 1;
        } else {
            // Bulk delete (Discord API allows bulk delete for messages newer than 14 days)
            try {
                await channel.bulkDelete(messagesToDelete, true);
                deletedCount = messagesToDelete.length;
            } catch (error) {
                // Fallback to individual deletion if bulk delete fails
                console.error('Bulk delete failed, falling back to individual deletion:', error);
                
                for (const message of messagesToDelete) {
                    try {
                        await message.delete();
                        deletedCount++;
                        
                        // Small delay to avoid rate limits
                        if (deletedCount % 5 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (deleteError) {
                        console.error('Failed to delete message:', deleteError);
                        // Continue with other messages
                    }
                }
            }
        }

        // Success response
        const responseMessage = targetUser 
            ? `✅ Successfully deleted **${deletedCount}** message(s) from **${targetUser.username}** in ${channel}.`
            : `✅ Successfully deleted **${deletedCount}** message(s) from ${channel}.`;

        await interaction.editReply({
            content: `${responseMessage}\n\n**Reason:** ${reason}\n**Executed by:** ${interaction.user}`
        });

        // Log the action (optional - you could send this to a log channel)
        console.log(`[CLEAN] ${interaction.user.tag} (${interaction.user.id}) deleted ${deletedCount} messages in ${channel.name} (${channel.id}). Reason: ${reason}`);

    } catch (error) {
        console.error('Error in clean command:', error);
        
        const errorMessage = interaction.deferred 
            ? { content: '❌ An error occurred while trying to delete messages. Please check my permissions and try again.' }
            : { content: '❌ An error occurred while trying to delete messages. Please check my permissions and try again.', flags: 64 };

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

export default {
    data,
    execute
};