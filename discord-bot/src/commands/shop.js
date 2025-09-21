import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = pkg;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FishingRNG } from '../systems/fishing_rng.js';

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
            .setName('bait')
            .setDescription('Browse and purchase fishing bait'))
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

            case 'bait':
                return await handleBait(interaction, database, guildId, userId);
            
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

async function handleBait(interaction, database, guildId, userId) {
    // Check and refresh bait stock if needed
    FishingRNG.checkShopBaitReset();
    
    // Get available bait from shop
    const availableBait = FishingRNG.getShopBaitStock();
    const baitEntries = Object.entries(availableBait);
    
    if (baitEntries.length === 0) {
        return interaction.reply({
            content: '🎣 No bait is currently available for purchase.',
            flags: 64 // EPHEMERAL
        });
    }

    // Get user's current balance
    const economy = database.upsertEconomy(userId, guildId);
    const userMoney = economy ? economy.money : 0;

    const embed = new EmbedBuilder()
        .setTitle('🎣 Bait Shop')
        .setDescription('Purchase high-quality bait to improve your fishing success!\n\n💰 **Your Balance:** ' + userMoney + ' coins')
        .setColor('#4CAF50')
        .setTimestamp();

    let baitDescription = '';
    const baitOptions = [];

    baitEntries.forEach(([baitType, baitData]) => {
        if (baitData.current_stock > 0) {
            const affordableQty = Math.floor(userMoney / baitData.shop_price);
            const maxPurchase = Math.min(affordableQty, baitData.current_stock);
            
            baitDescription += `${baitData.emoji} **${baitData.name}**\n`;
            baitDescription += `   💰 Price: ${baitData.shop_price} coins each\n`;
            baitDescription += `   📦 Stock: ${baitData.current_stock} available\n`;
            baitDescription += `   📝 ${baitData.description}\n`;
            
            if (maxPurchase > 0) {
                baitDescription += `   ✅ You can buy up to ${maxPurchase}\n\n`;
                
                baitOptions.push({
                    label: baitData.name,
                    value: `bait_${baitType}`,
                    description: `${baitData.shop_price} coins | Stock: ${baitData.current_stock}`,
                    emoji: baitData.emoji
                });
            } else {
                baitDescription += `   ❌ Not enough coins\n\n`;
            }
        } else {
            baitDescription += `${baitData.emoji} **${baitData.name}** - ❌ **OUT OF STOCK**\n\n`;
        }
    });

    embed.addFields({
        name: '🛒 Available Bait',
        value: baitDescription,
        inline: false
    });

    const resetInfo = FishingRNG.checkShopBaitReset();
    embed.setFooter({
        text: `Stock resets every 12 hours | Next reset: ${new Date(resetInfo.next_reset).toLocaleString()}`
    });

    if (baitOptions.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`bait_buy_${userId}`)
            .setPlaceholder('Select bait to purchase...')
            .addOptions(baitOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({ 
            embeds: [embed], 
            components: [row], 
            flags: 64 // EPHEMERAL
        });
    } else {
        return interaction.reply({ 
            embeds: [embed], 
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

// Function to handle bait purchase from select menu
async function handleBaitPurchase(interaction, database, baitType) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Get user's current balance
    const economy = database.upsertEconomy(userId, guildId);
    const userMoney = economy ? economy.money : 0;
    
    // Get bait information
    const baitInfo = FishingRNG.getBaitInfo(baitType);
    const availableBait = FishingRNG.getShopBaitStock();
    const baitData = availableBait[baitType];
    
    if (!baitData || baitData.current_stock <= 0) {
        return interaction.update({
            content: '❌ This bait is out of stock!',
            embeds: [],
            components: []
        });
    }
    
    if (userMoney < baitData.shop_price) {
        return interaction.update({
            content: `❌ You need ${baitData.shop_price - userMoney} more coins to buy ${baitInfo.emoji} ${baitInfo.name}!`,
            embeds: [],
            components: []
        });
    }
    
    // Calculate maximum affordable quantity
    const maxAffordable = Math.floor(userMoney / baitData.shop_price);
    const maxPurchase = Math.min(maxAffordable, baitData.current_stock);
    
    // For now, buy 1 at a time. Could be enhanced to ask for quantity
    const quantityToBuy = 1;
    
    // Purchase the bait
    const purchaseResult = FishingRNG.purchaseBait(baitType, quantityToBuy);
    
    if (!purchaseResult.success) {
        return interaction.update({
            content: `❌ Failed to purchase bait: ${purchaseResult.message}`,
            embeds: [],
            components: []
        });
    }
    
    // Deduct money from user
    database.updateMoney(userId, guildId, -purchaseResult.total_cost);
    
    // Add bait to user's inventory
    FishingRNG.addBait(userId, baitType, quantityToBuy);
    
    const newEconomy = database.upsertEconomy(userId, guildId);
    const newBalance = newEconomy ? newEconomy.money : 0;
    
    const embed = new EmbedBuilder()
        .setTitle('🎣 Bait Purchased!')
        .setDescription(`You successfully purchased ${quantityToBuy}x ${baitInfo.emoji} **${baitInfo.name}**!`)
        .addFields(
            { name: '💰 Cost', value: `${purchaseResult.total_cost} coins`, inline: true },
            { name: '💳 New Balance', value: `${newBalance} coins`, inline: true },
            { name: '📦 Remaining Stock', value: `${purchaseResult.remaining_stock}`, inline: true }
        )
        .setColor('#4CAF50')
        .setTimestamp()
        .setFooter({ text: 'Use this bait when fishing for better results!' });

    return interaction.update({ 
        embeds: [embed], 
        components: [] 
    });
}

export default {
    data,
    execute,
    handlePurchaseFromSelect,
    handleInventoryDetails,
    handleUseFromSelect,
    handleBaitPurchase
};