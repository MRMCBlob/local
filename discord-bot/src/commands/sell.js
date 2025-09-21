import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FishingRNG } from '../systems/fishing_rng.js';

export const data = new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell all the fish in your inventory for coins!');

export async function execute(interaction, database) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        // Get user's current inventory before selling
        const inventory = FishingRNG.getUserInventory(userId);
        
        if (inventory.fish.length === 0) {
            const emptyEmbed = new EmbedBuilder()
                .setTitle('🎒 No Fish to Sell')
                .setDescription(
                    `Your fishing net is empty!\n\n` +
                    `🎣 Use \`/fish\` to catch some fish first!`
                )
                .setColor('#E67E22')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'Go fishing and come back when you have a catch!' });

            const fishButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`fish_now_${userId}`)
                        .setLabel('🎣 Go Fishing')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.reply({
                embeds: [emptyEmbed],
                components: [fishButton],
                ephemeral: true
            });
        }

        // Create confirmation embed showing what will be sold
        const confirmEmbed = new EmbedBuilder()
            .setTitle('💰 Fish Market - Confirm Sale')
            .setDescription(
                `Are you sure you want to sell all your fish?\n\n` +
                `**Total Fish:** ${inventory.fish.length}\n` +
                `**Total Value:** ${inventory.total_value.toLocaleString()} coins\n\n` +
                `This action cannot be undone!`
            )
            .setColor('#F39C12')
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: 'Click confirm to sell all your fish!' });

        // Group fish by rarity for display
        const rarityGroups = {};
        inventory.fish.forEach(fish => {
            if (!rarityGroups[fish.rarity]) {
                rarityGroups[fish.rarity] = [];
            }
            rarityGroups[fish.rarity].push(fish);
        });

        // Add fields showing fish breakdown
        const rarityOrder = ['mythic', 'legendary', 'rare', 'uncommon', 'common'];
        rarityOrder.forEach(rarity => {
            if (rarityGroups[rarity]) {
                const fishList = rarityGroups[rarity];
                const totalValue = fishList.reduce((sum, fish) => sum + fish.value, 0);
                
                // Show first few fish names, then summarize if too many
                const fishNames = fishList.slice(0, 5).map(fish => `${fish.emoji} ${fish.name}`);
                const displayText = fishList.length > 5 
                    ? fishNames.join(', ') + ` +${fishList.length - 5} more`
                    : fishNames.join(', ');

                confirmEmbed.addFields({
                    name: `${rarity.charAt(0).toUpperCase() + rarity.slice(1)} (${fishList.length})`,
                    value: `${displayText}\n**Value:** ${totalValue.toLocaleString()} coins`,
                    inline: false
                });
            }
        });

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`sell_confirm_${userId}`)
                    .setLabel('✅ Confirm Sale')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`sell_cancel_${userId}`)
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmButtons],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in sell command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Something went wrong while preparing the sale. Please try again!')
            .setColor('#E74C3C');

        await interaction.reply({
            embeds: [errorEmbed],
            ephemeral: true
        });
    }
}

/**
 * Handle sell-related button interactions
 * @param {Object} interaction - Discord interaction
 * @param {Object} database - Database instance
 */
export async function handleButtonInteraction(interaction, database) {
    const [action, subAction, targetUserId] = interaction.customId.split('_');
    
    // Check if the user clicking is the one who initiated the command
    if (interaction.user.id !== targetUserId) {
        return interaction.reply({
            content: '❌ This is not your sale!',
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        switch (subAction) {
            case 'confirm':
                return await confirmSale(interaction, database);
            case 'cancel':
                return await cancelSale(interaction);
            case 'now': // From "Go Fishing" button
                const fishCommand = await import('./fish.js');
                return await fishCommand.execute(interaction, database);
            default:
                return interaction.reply({
                    content: '❌ Unknown sell action.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error handling sell button interaction:', error);
        
        await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
        });
    }
}

/**
 * Confirm and execute the fish sale
 * @param {Object} interaction - Discord interaction
 * @param {Object} database - Database instance
 */
async function confirmSale(interaction, database) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        // Attempt to sell all fish
        const saleResult = FishingRNG.sellAllFish(userId);
        
        if (!saleResult.success) {
            const noFishEmbed = new EmbedBuilder()
                .setTitle('🎒 No Fish to Sell')
                .setDescription(saleResult.message)
                .setColor('#E67E22');

            return interaction.update({
                embeds: [noFishEmbed],
                components: []
            });
        }

        // Add money to user's account using existing money system
        const newEconomy = database.updateMoney(userId, guildId, saleResult.total_value);
        
        if (!newEconomy) {
            throw new Error('Failed to update user money');
        }

        // Create sale success embed
        const successEmbed = new EmbedBuilder()
            .setTitle('💰 Fish Sold Successfully!')
            .setDescription(
                `You sold all your fish to the market!\n\n` +
                `**Fish Sold:** ${saleResult.fish_count}\n` +
                `**Coins Earned:** +${saleResult.total_value.toLocaleString()}\n` +
                `**New Balance:** ${newEconomy.money.toLocaleString()} coins\n\n` +
                `Thank you for your business! 🐟`
            )
            .setColor('#27AE60')
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: 'Your fishing net is now empty. Time to catch more fish!' });

        // Add breakdown of sold fish by rarity
        const rarityGroups = {};
        saleResult.fish_sold.forEach(fish => {
            if (!rarityGroups[fish.rarity]) {
                rarityGroups[fish.rarity] = { count: 0, value: 0 };
            }
            rarityGroups[fish.rarity].count++;
            rarityGroups[fish.rarity].value += fish.value;
        });

        // Add sale breakdown fields
        const rarityOrder = ['mythic', 'legendary', 'rare', 'uncommon', 'common'];
        rarityOrder.forEach(rarity => {
            if (rarityGroups[rarity]) {
                const group = rarityGroups[rarity];
                successEmbed.addFields({
                    name: `${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`,
                    value: `${group.count} fish - ${group.value.toLocaleString()} coins`,
                    inline: true
                });
            }
        });

        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`fish_again_${userId}`)
                    .setLabel('🎣 Go Fishing Again')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`check_balance_${userId}`)
                    .setLabel('💳 Check Balance')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.update({
            embeds: [successEmbed],
            components: [actionButtons]
        });

        // Log the successful sale
        console.log(`User ${userId} sold ${saleResult.fish_count} fish for ${saleResult.total_value} coins`);

    } catch (error) {
        console.error('Error confirming fish sale:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Sale Failed')
            .setDescription('Something went wrong while selling your fish. Please try again!')
            .setColor('#E74C3C');

        await interaction.update({
            embeds: [errorEmbed],
            components: []
        });
    }
}

/**
 * Cancel the fish sale
 * @param {Object} interaction - Discord interaction
 */
async function cancelSale(interaction) {
    const userId = interaction.user.id;
    const inventory = FishingRNG.getUserInventory(userId);

    const cancelEmbed = new EmbedBuilder()
        .setTitle('❌ Sale Cancelled')
        .setDescription(
            `Sale cancelled! Your fish are safe in your net.\n\n` +
            `**Fish Count:** ${inventory.fish.length}\n` +
            `**Total Value:** ${inventory.total_value.toLocaleString()} coins\n\n` +
            `You can sell them anytime with \`/sell\`!`
        )
        .setColor('#95A5A6')
        .setThumbnail(interaction.user.displayAvatarURL());

    const actionButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`fish_again_${userId}`)
                .setLabel('🎣 Keep Fishing')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`view_inventory_${userId}`)
                .setLabel('🎒 View Inventory')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({
        embeds: [cancelEmbed],
        components: [actionButtons]
    });
}

export default {
    data,
    execute,
    handleButtonInteraction
};