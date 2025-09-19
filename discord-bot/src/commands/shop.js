import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
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
    console.error('Error loading config.json in shop command:', error.message);
    config = { shop: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the daily shop')
    .addSubcommand(subcommand =>
        subcommand
            .setName('browse')
            .setDescription('View available items in the shop'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('buy')
            .setDescription('Purchase an item from the shop'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('inventory')
            .setDescription('View your purchased items'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('use')
            .setDescription('Use an item from your inventory'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('refresh')
            .setDescription('Refresh shop inventory (Admin only)'));

export async function execute(interaction, database) {
    if (!config.shop?.enabled) {
        return interaction.reply({
            content: '🚫 The shop is currently closed.',
            flags: 64 // EPHEMERAL
        });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    try {
        switch (subcommand) {
            case 'browse':
                return await handleBrowse(interaction, database, guildId);
            
            case 'buy':
                return await handleBuy(interaction, database, guildId, userId);
            
            case 'inventory':
                return await handleInventory(interaction, database, guildId, userId);
            
            case 'use':
                return await handleUse(interaction, database, guildId, userId);
            
            case 'refresh':
                return await handleRefresh(interaction, database, guildId);
            
            default:
                return interaction.reply({
                    content: '❌ Unknown subcommand.',
                    flags: 64 // EPHEMERAL
                });
        }
    } catch (error) {
        console.error('Error in shop command:', error);
        return interaction.reply({
            content: '❌ An error occurred while processing your request.',
            flags: 64 // EPHEMERAL
        });
    }
}

async function handleBrowse(interaction, database, guildId) {
    const shopItems = database.getShopInventory(guildId);
    
    if (shopItems.length === 0) {
        // Auto-refresh if empty
        const refreshResult = database.refreshShopInventory(guildId);
        if (refreshResult.success) {
            const newItems = database.getShopInventory(guildId);
            if (newItems.length === 0) {
                return interaction.reply({
                    content: '🏪 The shop is currently empty. Please try again later.',
                    flags: 64 // EPHEMERAL
                });
            }
            shopItems.push(...newItems);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🏪 Daily Shop')
        .setDescription('Welcome to the shop! Items refresh daily at midnight.')
        .setColor('#FFD700')
        .setTimestamp();

    // Group items by category
    const categories = {};
    const eventItems = [];

    for (const item of shopItems) {
        if (item.is_event_item) {
            eventItems.push(item);
        } else {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        }
    }

    // Add event items first if they exist
    if (eventItems.length > 0) {
        let eventDescription = '';
        for (const item of eventItems) {
            const rarity = getRarityEmoji(item.rarity);
            eventDescription += `${rarity} **${item.item_name}** - ${item.price} coins\n`;
            eventDescription += `   ${item.item_description}\n\n`;
        }
        
        embed.addFields({
            name: '🎉 Special Event Items',
            value: eventDescription,
            inline: false
        });
    }

    // Add regular categories
    for (const [categoryKey, items] of Object.entries(categories)) {
        const categoryConfig = config.shop.categories[categoryKey];
        const categoryName = categoryConfig?.name || categoryKey;
        
        let categoryDescription = '';
        for (const item of items) {
            const rarity = getRarityEmoji(item.rarity);
            categoryDescription += `${rarity} **${item.item_name}** - ${item.price} coins\n`;
            categoryDescription += `   ${item.item_description}\n\n`;
        }
        
        if (categoryDescription) {
            embed.addFields({
                name: categoryName,
                value: categoryDescription,
                inline: false
            });
        }
    }

    embed.setFooter({
        text: 'Use /shop buy to select and purchase items • Shop refreshes daily'
    });

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleBuy(interaction, database, guildId, userId) {
    // Get current shop items
    const shopItems = database.getShopInventory(guildId);
    
    if (shopItems.length === 0) {
        // Auto-refresh if empty
        const refreshResult = database.refreshShopInventory(guildId);
        if (refreshResult.success) {
            const newItems = database.getShopInventory(guildId);
            if (newItems.length === 0) {
                return interaction.reply({
                    content: '🏪 The shop is currently empty. Please try again later.',
                    flags: 64 // EPHEMERAL
                });
            }
            shopItems.push(...newItems);
        }
    }

    // Create select menu options from shop items
    const selectOptions = shopItems.slice(0, 25).map(item => { // Discord limit is 25 options
        const rarity = getRarityEmoji(item.rarity);
        return {
            label: item.item_name,
            value: item.item_id,
            description: `${item.price} coins - ${item.item_description.substring(0, 100)}`,
            emoji: rarity
        };
    });

    if (selectOptions.length === 0) {
        return interaction.reply({
            content: '🏪 No items available for purchase.',
            flags: 64 // EPHEMERAL
        });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`shop_buy_${userId}`)
        .setPlaceholder('Select an item to purchase...')
        .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle('🛒 Purchase Item')
        .setDescription('Select an item from the dropdown menu to purchase it.')
        .setColor('#00FF00')
        .setTimestamp();

    return interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        flags: 64 // EPHEMERAL
    });
}

async function handleInventory(interaction, database, guildId, userId) {
    const userItems = database.getUserInventory(userId, guildId);

    if (userItems.length === 0) {
        return interaction.reply({
            content: '🎒 Your inventory is empty. Visit the shop to buy some items!',
            flags: 64 // EPHEMERAL
        });
    }

    // Create select menu options from user's inventory
    const selectOptions = userItems.slice(0, 25).map(item => { // Discord limit is 25 options
        const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
        return {
            label: item.item_name,
            value: item.id.toString(),
            description: `Qty: ${item.quantity} | Purchased: ${purchaseDate}`,
            emoji: '📦'
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`shop_inventory_${userId}`)
        .setPlaceholder('Select an item to view details...')
        .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle('🎒 Your Inventory')
        .setDescription(`You have **${userItems.length}** different items in your inventory.\nSelect an item below to view its details.`)
        .setColor('#4169E1')
        .setTimestamp()
        .setFooter({
            text: 'Select an item to see detailed information'
        });

    return interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        flags: 64 // EPHEMERAL
    });
}

async function handleUse(interaction, database, guildId, userId) {
    const userItems = database.getUserInventory(userId, guildId);

    if (userItems.length === 0) {
        return interaction.reply({
            content: '🎒 Your inventory is empty. You need items to use them!',
            flags: 64 // EPHEMERAL
        });
    }

    // Filter out items that can't be used (if there's a property for that)
    const usableItems = userItems.filter(item => item.quantity > 0);

    if (usableItems.length === 0) {
        return interaction.reply({
            content: '🎒 You have no usable items in your inventory.',
            flags: 64 // EPHEMERAL
        });
    }

    // Create select menu options from user's usable inventory
    const selectOptions = usableItems.slice(0, 25).map(item => { // Discord limit is 25 options
        return {
            label: item.item_name,
            value: item.id.toString(),
            description: `Quantity: ${item.quantity} available`,
            emoji: '✨'
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`shop_use_${userId}`)
        .setPlaceholder('Select an item to use...')
        .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle('✨ Use Item')
        .setDescription('Select an item from your inventory to use it.')
        .setColor('#FF69B4')
        .setTimestamp();

    return interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        flags: 64 // EPHEMERAL
    });
}

async function handleRefresh(interaction, database, guildId) {
    // Check admin permissions
    const hasAdminPermission = interaction.member.permissions.has('Administrator');
    const adminRoleId = config.events?.adminRoleId;
    const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);

    if (!hasAdminPermission && !hasAdminRole) {
        return interaction.reply({
            content: '❌ You need administrator permissions to refresh the shop.',
            flags: 64 // EPHEMERAL
        });
    }

    const result = database.refreshShopInventory(guildId);

    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to refresh shop: ${result.error}`,
            flags: 64 // EPHEMERAL
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔄 Shop Refreshed!')
        .setDescription('The shop inventory has been manually refreshed with proper effects.')
        .addFields({
            name: 'Items Added',
            value: `Daily Items: ${result.dailyCount}\nEvent Items: ${result.eventCount}`,
            inline: false
        })
        .addFields({
            name: '🔍 Debug Info',
            value: 'All items now have proper effects data stored in the database.',
            inline: false
        })
        .setColor('#00FF00')
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}

function getRarityEmoji(rarity) {
    const rarityEmojis = {
        'common': '⚪',
        'uncommon': '🟢',
        'rare': '🔵',
        'epic': '🟣',
        'legendary': '🟡',
        'event': '🌟'
    };
    return rarityEmojis[rarity] || '⚪';
}

// Function to handle item purchase from select menu
async function handlePurchaseFromSelect(interaction, database, itemId) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Get the item details
    const shopItems = database.getShopInventory(guildId);
    const item = shopItems.find(i => i.item_id === itemId);

    if (!item) {
        return interaction.update({
            content: '❌ This item is no longer available in the shop.',
            embeds: [],
            components: []
        });
    }

    const result = database.purchaseItem(userId, guildId, item.item_id);

    if (!result.success) {
        if (result.error === 'Insufficient funds') {
            return interaction.update({
                content: `❌ You need ${result.needed} more coins to buy **${item.item_name}**.\nPrice: ${item.price} coins`,
                embeds: [],
                components: []
            });
        }
        
        return interaction.update({
            content: `❌ Failed to purchase item: ${result.error}`,
            embeds: [],
            components: []
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🛍️ Purchase Successful!')
        .setDescription(`You purchased **${item.item_name}** for **${item.price}** coins!`)
        .addFields({
            name: 'Item Description',
            value: item.item_description,
            inline: false
        })
        .addFields({
            name: 'New Balance',
            value: `${result.newBalance} coins`,
            inline: true
        })
        .setColor('#00FF00')
        .setTimestamp();

    return interaction.update({ 
        embeds: [embed], 
        components: [] // Remove the select menu after purchase
    });
}

// Function to handle inventory item details viewing
async function handleInventoryDetails(interaction, database, itemId) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Get the user's inventory
    const userItems = database.getUserInventory(userId, guildId);
    const item = userItems.find(i => i.id.toString() === itemId);

    if (!item) {
        return interaction.update({
            content: '❌ This item is no longer in your inventory.',
            embeds: [],
            components: []
        });
    }

    const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
    
    const embed = new EmbedBuilder()
        .setTitle(`📦 ${item.item_name}`)
        .setDescription(item.item_description || 'No description available')
        .addFields(
            { name: 'Quantity', value: item.quantity.toString(), inline: true },
            { name: 'Purchased', value: purchaseDate, inline: true },
            { name: 'Item ID', value: item.id.toString(), inline: true }
        )
        .setColor('#4169E1')
        .setTimestamp()
        .setFooter({
            text: 'Use /shop use to use this item'
        });

    return interaction.update({ 
        embeds: [embed], 
        components: [] // Remove the select menu after viewing
    });
}

// Function to handle item usage from select menu
async function handleUseFromSelect(interaction, database, itemId) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    const result = database.useItem(userId, guildId, parseInt(itemId));

    if (!result.success) {
        return interaction.update({
            content: `❌ ${result.error}`,
            embeds: [],
            components: []
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('✨ Item Used!')
        .setDescription(`You used your item successfully!`)
        .addFields({
            name: 'Effects Applied',
            value: result.effects.length > 0 ? result.effects.join('\n') : 'No special effects detected',
            inline: false
        });

    if (result.coinsGained > 0) {
        embed.addFields({
            name: '💰 Coins Gained',
            value: `+${result.coinsGained} coins`,
            inline: true
        });
        embed.setColor('#FFD700'); // Gold color when coins are gained
    } else {
        embed.setColor('#FF69B4'); // Pink color for other effects
    }

    embed.setTimestamp();

    if (result.consumed) {
        embed.setFooter({ text: 'This item was consumed and removed from your inventory.' });
    } else {
        embed.setFooter({ text: 'This item remains in your inventory.' });
    }

    return interaction.update({ 
        embeds: [embed], 
        components: [] // Remove the select menu after use
    });
}

export default {
    data,
    execute,
    handlePurchaseFromSelect,
    handleInventoryDetails,
    handleUseFromSelect
};