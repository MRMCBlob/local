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
    console.error('Error loading config.json in gambling command:', error.message);
    config = { gambling: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('gambling')
    .setDescription('Play gambling games and win coins!')
    .addStringOption(option =>
        option.setName('game')
            .setDescription('Choose a game to play')
            .addChoices(
                { name: '🪙 Coin Flip', value: 'coinflip' },
                { name: '🃏 Blackjack', value: 'blackjack' },
                { name: '🎰 Poker', value: 'poker' },
                { name: '🎲 Random Game', value: 'random' }
            ))
    .addIntegerOption(option =>
        option.setName('bet')
            .setDescription('Amount to bet')
            .setMinValue(1));

export async function execute(interaction, database) {
    if (!config.gambling?.enabled) {
        return interaction.reply({
            content: '🚫 Gambling is currently disabled.',
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const gameChoice = interaction.options.getString('game');
    const betAmount = interaction.options.getInteger('bet');

    // Get user's economy data
    const economy = database.upsertEconomy(userId, guildId);
    
    if (!economy) {
        return interaction.reply({
            content: '❌ Error accessing your account. Please try again.',
            ephemeral: true
        });
    }

    // If no game specified, show selection menu
    if (!gameChoice) {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Gambling Games')
            .setDescription(`Choose a game to play!\n\n💰 **Your Balance:** ${economy.money} coins`)
            .addFields(
                { name: '🪙 Coin Flip', value: 'Simple 50/50 chance game', inline: true },
                { name: '🃏 Blackjack', value: 'Beat the dealer to 21', inline: true },
                { name: '🎰 Poker', value: 'Get the best hand possible', inline: true }
            )
            .setColor('#FFD700')
            .setFooter({ text: 'Select a game from the menu below!' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`gambling_select_${userId}`)
            .setPlaceholder('Choose your game...')
            .addOptions([
                {
                    label: '🪙 Coin Flip',
                    description: 'Simple heads or tails game',
                    value: 'coinflip'
                },
                {
                    label: '🃏 Blackjack',
                    description: 'Classic card game against the dealer',
                    value: 'blackjack'
                },
                {
                    label: '🎰 Poker',
                    description: 'Five card draw poker',
                    value: 'poker'
                },
                {
                    label: '🎲 Random Game',
                    description: 'Let fate decide your game!',
                    value: 'random'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: false
        });
    }

    // If no bet specified, ask for bet amount
    if (!betAmount) {
        const embed = new EmbedBuilder()
            .setTitle('💰 Place Your Bet')
            .setDescription(`You selected **${getGameName(gameChoice)}**\n\n` +
                `💰 **Your Balance:** ${economy.money} coins\n` +
                `📊 **Min Bet:** ${config.gambling.minBet} coins\n` +
                `📊 **Max Bet:** ${config.gambling.maxBet} coins\n\n` +
                `Use \`/gambling game:${gameChoice} bet:<amount>\` to place your bet!`)
            .setColor('#FFD700');

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    // Validate bet amount
    if (betAmount < config.gambling.minBet) {
        return interaction.reply({
            content: `❌ Minimum bet is ${config.gambling.minBet} coins.`,
            ephemeral: true
        });
    }

    if (betAmount > config.gambling.maxBet) {
        return interaction.reply({
            content: `❌ Maximum bet is ${config.gambling.maxBet} coins.`,
            ephemeral: true
        });
    }

    if (betAmount > economy.money) {
        return interaction.reply({
            content: `❌ You don't have enough coins! Your balance: ${economy.money} coins.`,
            ephemeral: true
        });
    }

    // Determine which game to play
    let finalGame = gameChoice;
    if (gameChoice === 'random') {
        const games = ['coinflip', 'blackjack', 'poker'];
        finalGame = games[Math.floor(Math.random() * games.length)];
    }

    // Play the selected game
    try {
        switch (finalGame) {
            case 'coinflip':
                return await playCoinFlip(interaction, database, betAmount);
            case 'blackjack':
                return await playBlackjack(interaction, database, betAmount);
            case 'poker':
                return await playPoker(interaction, database, betAmount);
            default:
                return interaction.reply({
                    content: '❌ Invalid game selection.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error playing game:', error);
        return interaction.reply({
            content: '❌ An error occurred while playing the game.',
            ephemeral: true
        });
    }
}

function getGameName(gameValue) {
    const gameNames = {
        'coinflip': '🪙 Coin Flip',
        'blackjack': '🃏 Blackjack',
        'poker': '🎰 Poker',
        'random': '🎲 Random Game'
    };
    return gameNames[gameValue] || gameValue;
}

async function playCoinFlip(interaction, database, betAmount) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // User's choice
    const userChoice = Math.random() < 0.5 ? 'heads' : 'tails';
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = userChoice === result;
    
    const winAmount = won ? Math.floor(betAmount * config.gambling.games.coinFlip.payout) : -betAmount;
    const newEconomy = database.updateMoney(userId, guildId, winAmount);
    
    const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip Results')
        .setDescription(
            `🎯 **Your Choice:** ${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}\n` +
            `🪙 **Result:** ${result.charAt(0).toUpperCase() + result.slice(1)}\n\n` +
            `${won ? '🎉 **You Won!**' : '💸 **You Lost!**'}\n` +
            `💰 **Amount:** ${won ? '+' : ''}${winAmount} coins\n` +
            `💳 **New Balance:** ${newEconomy.money} coins`
        )
        .setColor(won ? '#00FF00' : '#FF0000')
        .setFooter({ text: `Bet: ${betAmount} coins` });

    return interaction.reply({ embeds: [embed] });
}

async function playBlackjack(interaction, database, betAmount) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Simple blackjack simulation
    const playerHand = drawCards(2);
    const dealerHand = drawCards(2);
    
    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(dealerHand);
    
    let result;
    let winAmount;
    
    if (playerScore === 21 && dealerScore !== 21) {
        result = 'Blackjack! You win!';
        winAmount = Math.floor(betAmount * config.gambling.games.blackjack.payout);
    } else if (playerScore > 21) {
        result = 'Bust! You lose!';
        winAmount = -betAmount;
    } else if (dealerScore > 21 || playerScore > dealerScore) {
        result = 'You win!';
        winAmount = Math.floor(betAmount * config.gambling.games.blackjack.payout);
    } else if (playerScore === dealerScore) {
        result = 'Push! Tie game!';
        winAmount = 0;
    } else {
        result = 'Dealer wins!';
        winAmount = -betAmount;
    }
    
    const newEconomy = database.updateMoney(userId, guildId, winAmount);
    
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack Results')
        .setDescription(
            `**Your Hand:** ${playerHand.join(' ')} (${playerScore})\n` +
            `**Dealer Hand:** ${dealerHand.join(' ')} (${dealerScore})\n\n` +
            `🎯 **Result:** ${result}\n` +
            `💰 **Amount:** ${winAmount > 0 ? '+' : ''}${winAmount} coins\n` +
            `💳 **New Balance:** ${newEconomy.money} coins`
        )
        .setColor(winAmount > 0 ? '#00FF00' : winAmount < 0 ? '#FF0000' : '#FFFF00')
        .setFooter({ text: `Bet: ${betAmount} coins` });

    return interaction.reply({ embeds: [embed] });
}

async function playPoker(interaction, database, betAmount) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    const hand = drawCards(5);
    const handType = evaluatePokerHand(hand);
    const payout = config.gambling.games.poker.payouts[handType] || 0;
    
    const winAmount = payout > 0 ? Math.floor(betAmount * payout) - betAmount : -betAmount;
    const newEconomy = database.updateMoney(userId, guildId, winAmount);
    
    const embed = new EmbedBuilder()
        .setTitle('🎰 Poker Results')
        .setDescription(
            `**Your Hand:** ${hand.join(' ')}\n` +
            `**Hand Type:** ${handType.replace(/([A-Z])/g, ' $1').trim()}\n\n` +
            `🎯 **Payout:** ${payout}x\n` +
            `💰 **Amount:** ${winAmount > 0 ? '+' : ''}${winAmount} coins\n` +
            `💳 **New Balance:** ${newEconomy.money} coins`
        )
        .setColor(winAmount > 0 ? '#00FF00' : '#FF0000')
        .setFooter({ text: `Bet: ${betAmount} coins` });

    return interaction.reply({ embeds: [embed] });
}

// Card game helper functions
function drawCards(count) {
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const cards = [];
    
    for (let i = 0; i < count; i++) {
        const suit = suits[Math.floor(Math.random() * suits.length)];
        const rank = ranks[Math.floor(Math.random() * ranks.length)];
        cards.push(`${rank}${suit}`);
    }
    
    return cards;
}

function calculateScore(cards) {
    let score = 0;
    let aces = 0;
    
    for (const card of cards) {
        const rank = card.slice(0, -2);
        if (rank === 'A') {
            aces++;
            score += 11;
        } else if (['J', 'Q', 'K'].includes(rank)) {
            score += 10;
        } else {
            score += parseInt(rank);
        }
    }
    
    // Adjust for aces
    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }
    
    return score;
}

function evaluatePokerHand(cards) {
    // Extract ranks and suits from cards (format: "A♠️", "K♥️", etc.)
    const ranks = cards.map(card => card.slice(0, -2));
    const suits = cards.map(card => card.slice(-2));
    
    // Count occurrences of each rank
    const rankCounts = {};
    ranks.forEach(rank => {
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });
    
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).length;
    
    // Check for flush (all same suit)
    const isFlush = suits.every(suit => suit === suits[0]);
    
    // Check for straight
    const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let isStraight = false;
    
    // Convert ranks to numbers for straight checking
    const rankNumbers = ranks.map(rank => {
        if (rank === 'A') return [1, 14]; // Ace can be 1 or 14
        if (rank === 'J') return 11;
        if (rank === 'Q') return 12;
        if (rank === 'K') return 13;
        return parseInt(rank);
    });
    
    // Check for straight (simplified - check common straights)
    const sortedRanks = ranks.sort();
    const straightPatterns = [
        ['A', '2', '3', '4', '5'],
        ['2', '3', '4', '5', '6'],
        ['3', '4', '5', '6', '7'],
        ['4', '5', '6', '7', '8'],
        ['5', '6', '7', '8', '9'],
        ['6', '7', '8', '9', '10'],
        ['7', '8', '9', '10', 'J'],
        ['8', '9', '10', 'J', 'Q'],
        ['9', '10', 'J', 'Q', 'K'],
        ['10', 'J', 'Q', 'K', 'A']
    ];
    
    isStraight = straightPatterns.some(pattern => 
        pattern.every(rank => ranks.includes(rank))
    );
    
    // Determine hand type
    if (isStraight && isFlush) {
        // Check for royal flush
        if (ranks.includes('10') && ranks.includes('J') && ranks.includes('Q') && ranks.includes('K') && ranks.includes('A')) {
            return 'royalFlush';
        }
        return 'straightFlush';
    }
    
    if (counts[0] === 4) return 'fourOfAKind';
    if (counts[0] === 3 && counts[1] === 2) return 'fullHouse';
    if (isFlush) return 'flush';
    if (isStraight) return 'straight';
    if (counts[0] === 3) return 'threeOfAKind';
    if (counts[0] === 2 && counts[1] === 2) return 'twoPair';
    if (counts[0] === 2) return 'pair';
    
    return 'highCard'; // Default case (no pair)
}

export default {
    data,
    execute
};