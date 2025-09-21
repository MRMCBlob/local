import pkg from 'discord.js';
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = pkg;
import { LevelingDatabase } from '../database/database.js';
import { FishingRNG } from '../systems/fishing_rng.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '../../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const fishingCooldowns = new Map();

export const data = new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Go fishing and catch various fish!')
    .addStringOption(option =>
        option.setName('rod')
            .setDescription('Choose your fishing rod')
            .setRequired(false)
            .addChoices(
                { name: '🎣 Wooden Rod', value: 'wooden' },
                { name: '🏹 Carbon Rod', value: 'carbon' },
                { name: '⭐ Legendary Rod', value: 'legendary' }
            ))
    .addStringOption(option =>
        option.setName('bait')
            .setDescription('Choose your bait')
            .setRequired(false)
            .addChoices(
                { name: '🪱 Worm', value: 'worm' },
                { name: '🦗 Cricket', value: 'cricket' },
                { name: '🐟 Minnow', value: 'minnow' },
                { name: '🦐 Shrimp', value: 'shrimp' },
                { name: '🦑 Squid', value: 'squid' },
                { name: '✨ Magic Lure', value: 'magic_lure' }
            ));

export async function execute(interaction, database) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const rodType = interaction.options.getString('rod') || 'wooden';
    const baitType = interaction.options.getString('bait') || 'worm';
    
    // Get database instance from parameter
    const db = database;
    
    // Check cooldown
    const cooldownKey = `fishing_${userId}`;
    const now = Date.now();
    const cooldownTime = config.fishing.cooldown_minutes * 60 * 1000;
    
    if (fishingCooldowns.has(cooldownKey)) {
        const expirationTime = fishingCooldowns.get(cooldownKey) + cooldownTime;
        if (now < expirationTime) {
            const timeLeft = Math.ceil((expirationTime - now) / 1000 / 60);
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('⏰ Fishing Cooldown')
                .setDescription(`You need to wait ${timeLeft} minute(s) before fishing again!`)
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }

    // Check if user has required bait
    const userBait = FishingRNG.getUserBait(userId);
    if (!userBait[baitType] || userBait[baitType] < 1) {
        const baitInfo = FishingRNG.getBaitInfo(baitType);
        const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('🎣 No Bait!')
            .setDescription(`You don't have any ${baitInfo.emoji} ${baitInfo.name} to fish with!\n\nUse \`/daily\` to get free bait or buy some from the \`/shop\`.`)
            .addFields({
                name: '🎒 Your Bait',
                value: formatBaitInventory(userBait),
                inline: false
            })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Set cooldown
    fishingCooldowns.set(cooldownKey, now);

    try {
        // Use the bait
        const baitResult = FishingRNG.useBait(userId, baitType, 1);
        if (!baitResult.success) {
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('🎣 Bait Error')
                .setDescription(baitResult.message)
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // Generate random weather
        const weatherTypes = ['sunny', 'cloudy', 'rainy', 'stormy'];
        const weatherType = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
        
        // Fishing attempt
        const fishResult = FishingRNG.catchFish(rodType, weatherType, baitType);
        
        if (fishResult.success) {
            // Calculate money value
            const moneyEarned = Math.floor(fishResult.fish.value * (0.8 + Math.random() * 0.4));
            
            // Add to database
            await db.updateMoney(userId, guildId, moneyEarned);
            
            // Add to inventory
            FishingRNG.addToInventory(userId, fishResult.fish);
            
            const weatherEmoji = {
                sunny: '☀️',
                cloudy: '☁️',
                rainy: '🌧️',
                stormy: '⛈️'
            };
            
            const rodEmoji = {
                wooden: '🎣',
                carbon: '🏹',
                legendary: '⭐'
            };

            const baitInfo = FishingRNG.getBaitInfo(baitType);
            
            const embed = new EmbedBuilder()
                .setColor(fishResult.fish.color)
                .setTitle('🎣 Fishing Success!')
                .setDescription(`${fishResult.fish.emoji} **You caught a ${fishResult.fish.name}!**`)
                .addFields(
                    { name: '🎣 Rod Used', value: `${rodEmoji[rodType]} ${rodType.charAt(0).toUpperCase() + rodType.slice(1)} Rod`, inline: true },
                    { name: '🪱 Bait Used', value: `${baitInfo.emoji} ${baitInfo.name}`, inline: true },
                    { name: '🌤️ Weather', value: `${weatherEmoji[weatherType]} ${weatherType.charAt(0).toUpperCase() + weatherType.slice(1)}`, inline: true },
                    { name: '⭐ Rarity', value: fishResult.fish.rarity.charAt(0).toUpperCase() + fishResult.fish.rarity.slice(1), inline: true },
                    { name: '💰 Value', value: `$${moneyEarned}`, inline: true },
                    { name: '🪱 Bait Remaining', value: `${baitInfo.emoji} ${baitResult.remaining_amount}x`, inline: true }
                )
                .setFooter({ text: `${fishResult.fish.description}` })
                .setTimestamp();
                
            // Add action row with buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('view_inventory')
                        .setLabel('View Inventory')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎒'),
                    new ButtonBuilder()
                        .setCustomId('sell_last_fish')
                        .setLabel('Sell Fish')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💰'),
                    new ButtonBuilder()
                        .setCustomId('view_bait')
                        .setLabel('View Bait')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🪱')
                );
            
            return interaction.reply({ embeds: [embed], components: [row] });
        } else {
            const baitInfo = FishingRNG.getBaitInfo(baitType);
            const embed = new EmbedBuilder()
                .setColor(0x95A5A6)
                .setTitle('🎣 No Luck This Time')
                .setDescription('The fish weren\'t biting today... Better luck next time!')
                .addFields(
                    { name: '🎣 Rod Used', value: `${rodType.charAt(0).toUpperCase() + rodType.slice(1)} Rod`, inline: true },
                    { name: '🪱 Bait Used', value: `${baitInfo.emoji} ${baitInfo.name}`, inline: true },
                    { name: '🪱 Bait Remaining', value: `${baitInfo.emoji} ${baitResult.remaining_amount}x`, inline: true }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('Error in fish command:', error);
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error')
            .setDescription('An error occurred while fishing. Please try again later.')
            .setTimestamp();
        
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}

function formatBaitInventory(baitInventory) {
    const baitList = [];
    Object.entries(baitInventory).forEach(([baitType, amount]) => {
        if (amount > 0) {
            const baitInfo = FishingRNG.getBaitInfo(baitType);
            baitList.push(`${baitInfo.emoji} ${baitInfo.name}: ${amount}x`);
        }
    });
    
    return baitList.length > 0 ? baitList.join('\n') : 'No bait available';
}

export default {
    data,
    execute
};