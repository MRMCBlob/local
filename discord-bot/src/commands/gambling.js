import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
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

// Store active games for users
const activeGames = new Map();

export const data = new SlashCommandBuilder()
    .setName('gambling')
    .setDescription('Play gambling games and win coins!')
    .addIntegerOption(option =>
        option.setName('bet')
            .setDescription('Amount to bet (optional - can be set later)')
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
    const betAmount = interaction.options.getInteger('bet');

    // Get user's economy data
    const economy = database.upsertEconomy(userId, guildId);
    
    if (!economy) {
        return interaction.reply({
            content: '❌ Error accessing your account. Please try again.',
            ephemeral: true
        });
    }

    // Show main gambling menu
    const embed = new EmbedBuilder()
        .setTitle('🎰 Gambling Games')
        .setDescription(
            `Welcome to the casino! Choose your game and test your luck!\n\n` +
            `💰 **Your Balance:** ${economy.money.toLocaleString()} coins\n` +
            `📊 **Min Bet:** ${config.gambling.minBet} coins\n` +
            `📊 **Max Bet:** ${config.gambling.maxBet.toLocaleString()} coins\n\n` +
            `${betAmount ? `🎯 **Current Bet:** ${betAmount} coins\n\n` : ''}` +
            `Select a game below to start playing!`
        )
        .addFields(
            { name: '🪙 Coin Flip', value: `50/50 chance • ${config.gambling.games.coinFlip.payout}x payout`, inline: true },
            { name: '🃏 Blackjack', value: `Beat the dealer • ${config.gambling.games.blackjack.payout}x payout`, inline: true },
            { name: '🎰 Poker', value: `Best hand wins • Up to ${Math.max(...Object.values(config.gambling.games.poker.payouts))}x payout`, inline: true }
        )
        .setColor('#FFD700')
        .setFooter({ text: 'Good luck! 🍀' });

    const gameButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_coinflip_${userId}`)
                .setLabel('🪙 Coin Flip')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_blackjack_${userId}`)
                .setLabel('🃏 Blackjack')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_poker_${userId}`)
                .setLabel('🎰 Poker')
                .setStyle(ButtonStyle.Primary)
        );

    const utilityButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_random_${userId}`)
                .setLabel('🎲 Random Game')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`gambling_rules_${userId}`)
                .setLabel('📖 Rules')
                .setStyle(ButtonStyle.Secondary)
        );

    // Store bet amount if provided
    if (betAmount) {
        activeGames.set(userId, { bet: betAmount });
    }

    return interaction.reply({
        embeds: [embed],
        components: [gameButtons, utilityButtons],
        ephemeral: false
    });
}

// Handle button interactions
export async function handleButtonInteraction(interaction, database) {
    const parts = interaction.customId.split('_');
    const [action, game, ...rest] = parts;
    const targetUserId = parts[parts.length - 1];
    
    // Check if the user clicking is the one who initiated the command
    if (interaction.user.id !== targetUserId) {
        return interaction.reply({
            content: '❌ This is not your gambling session!',
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Handle back button - return to main menu
    if (game === 'back') {
        // Clear any active game data
        activeGames.delete(userId);
        
        // Show main gambling menu again
        const economy = database.upsertEconomy(userId, guildId);
        
        const embed = new EmbedBuilder()
            .setTitle('🎰 Gambling Games')
            .setDescription(
                `Welcome to the casino! Choose your game and test your luck!\n\n` +
                `💰 **Your Balance:** ${economy.money.toLocaleString()} coins\n` +
                `📊 **Min Bet:** ${config.gambling.minBet} coins\n` +
                `📊 **Max Bet:** ${config.gambling.maxBet.toLocaleString()} coins\n\n` +
                `Select a game below to start playing!`
            )
            .addFields(
                { name: '🪙 Coin Flip', value: `50/50 chance • ${config.gambling.games.coinFlip.payout}x payout`, inline: true },
                { name: '🃏 Blackjack', value: `Beat the dealer • ${config.gambling.games.blackjack.payout}x payout`, inline: true },
                { name: '🎰 Poker', value: `Best hand wins • Up to ${Math.max(...Object.values(config.gambling.games.poker.payouts))}x payout`, inline: true }
            )
            .setColor('#FFD700')
            .setFooter({ text: 'Good luck! 🍀' });

        const gameButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gambling_coinflip_${userId}`)
                    .setLabel('🪙 Coin Flip')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`gambling_blackjack_${userId}`)
                    .setLabel('🃏 Blackjack')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`gambling_poker_${userId}`)
                    .setLabel('🎰 Poker')
                    .setStyle(ButtonStyle.Primary)
            );

        const utilityButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gambling_random_${userId}`)
                    .setLabel('🎲 Random Game')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`gambling_rules_${userId}`)
                    .setLabel('📖 Rules')
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.update({
            embeds: [embed],
            components: [gameButtons, utilityButtons]
        });
    }

    switch (game) {
        case 'coinflip':
            return await startCoinFlip(interaction, database);
        case 'blackjack':
            return await startBlackjack(interaction, database);
        case 'poker':
            if (parts[2] === 'help') {
                return await showPokerHelp(interaction);
            } else if (parts[2] === 'again') {
                return await startPoker(interaction, database);
            }
            return await startPoker(interaction, database);
        case 'random':
            return await startRandomGame(interaction, database);
        case 'rules':
            return await showRules(interaction);
        case 'bet':
            return await handleBetSelection(interaction, database);
        case 'play':
            return await handleGamePlay(interaction, database);
        default:
            return interaction.reply({
                content: '❌ Unknown game action.',
                ephemeral: true
            });
    }
}

async function startCoinFlip(interaction, database) {
    const userId = interaction.user.id;
    let userGame = activeGames.get(userId) || {};
    
    if (!userGame.bet) {
        return await showBetSelection(interaction, 'coinflip');
    }

    const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip')
        .setDescription(
            `**Bet Amount:** ${userGame.bet} coins\n\n` +
            `Choose your side! The coin will flip and if you guess correctly, ` +
            `you'll win **${Math.floor(userGame.bet * config.gambling.games.coinFlip.payout)}** coins!`
        )
        .setColor('#FFD700');

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_play_coinflip_heads_${userId}`)
                .setLabel('🟡 Heads')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_play_coinflip_tails_${userId}`)
                .setLabel('⚫ Tails')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_back_${userId}`)
                .setLabel('⬅️ Back')
                .setStyle(ButtonStyle.Secondary)
        );

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

async function startBlackjack(interaction, database) {
    const userId = interaction.user.id;
    let userGame = activeGames.get(userId) || {};
    
    if (!userGame.bet) {
        return await showBetSelection(interaction, 'blackjack');
    }

    // Initialize blackjack game
    const deck = createDeck();
    const playerHand = [drawCard(deck), drawCard(deck)];
    const dealerHand = [drawCard(deck), drawCard(deck)];
    
    userGame.blackjack = {
        deck,
        playerHand,
        dealerHand,
        gameOver: false
    };
    activeGames.set(userId, userGame);

    const playerScore = calculateBlackjackScore(playerHand);
    const dealerVisibleCard = dealerHand[0];

    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack')
        .setDescription(
            `**Bet Amount:** ${userGame.bet} coins\n\n` +
            `**Your Hand:** ${playerHand.join(' ')} **(${playerScore})**\n` +
            `**Dealer:** ${dealerVisibleCard} ❓\n\n` +
            `${playerScore === 21 ? '🎉 **BLACKJACK!**' : 'What would you like to do?'}`
        )
        .setColor(playerScore === 21 ? '#00FF00' : '#FFD700');

    let buttons;
    if (playerScore === 21) {
        // Player has blackjack, finish game
        return await finishBlackjack(interaction, database, true);
    } else {
        buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gambling_play_blackjack_hit_${userId}`)
                    .setLabel('🃏 Hit')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`gambling_play_blackjack_stand_${userId}`)
                    .setLabel('✋ Stand')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`gambling_back_${userId}`)
                    .setLabel('⬅️ Back')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

async function startPoker(interaction, database) {
    const userId = interaction.user.id;
    let userGame = activeGames.get(userId) || {};
    
    if (!userGame.bet) {
        return await showBetSelection(interaction, 'poker');
    }

    // Deal 5 cards for poker
    const hand = drawCards(5);
    const handType = evaluatePokerHand(hand);
    const payout = config.gambling.games.poker.payouts[handType] || 0;
    
    userGame.poker = {
        hand,
        handType,
        payout
    };
    activeGames.set(userId, userGame);

    const winAmount = payout > 0 ? Math.floor(userGame.bet * payout) - userGame.bet : -userGame.bet;
    
    // Update user's money
    const newEconomy = database.updateMoney(userId, interaction.guild.id, winAmount);

    const embed = new EmbedBuilder()
        .setTitle('🎰 Poker Results')
        .setDescription(
            `**Bet Amount:** ${userGame.bet} coins\n\n` +
            `**Your Hand:** ${hand.join(' ')}\n` +
            `**Hand Type:** ${formatHandType(handType)}\n` +
            `**Multiplier:** ${payout}x\n\n` +
            `${winAmount > 0 ? '🎉 **You Won!**' : winAmount === 0 ? '🤝 **Break Even!**' : '💸 **You Lost!**'}\n` +
            `**Amount:** ${winAmount > 0 ? '+' : ''}${winAmount} coins\n` +
            `**New Balance:** ${newEconomy.money.toLocaleString()} coins`
        )
        .setColor(winAmount > 0 ? '#00FF00' : winAmount === 0 ? '#FFFF00' : '#FF0000')
        .setFooter({ text: 'Thanks for playing! 🎰' });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_poker_help_${userId}`)
                .setLabel('❓ Poker Help')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`gambling_poker_again_${userId}`)
                .setLabel('🔄 Play Again')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_back_${userId}`)
                .setLabel('⬅️ Back to Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    // Clear the poker game data
    delete userGame.poker;
    activeGames.set(userId, userGame);

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

async function showPokerHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎰 Poker Tutorial')
        .setDescription(
            `**How to Play:**\n` +
            `You're dealt 5 cards and win based on your hand strength!\n\n` +
            `**Hand Rankings (Highest to Lowest):**`
        )
        .addFields(
            { name: '👑 Royal Flush', value: `A♠️ K♠️ Q♠️ J♠️ 10♠️\n**${config.gambling.games.poker.payouts.royalFlush}x** payout`, inline: true },
            { name: '💎 Straight Flush', value: `5 consecutive cards, same suit\n**${config.gambling.games.poker.payouts.straightFlush}x** payout`, inline: true },
            { name: '🎯 Four of a Kind', value: `Four cards of same rank\n**${config.gambling.games.poker.payouts.fourOfAKind}x** payout`, inline: true },
            { name: '🏠 Full House', value: `Three of a kind + Pair\n**${config.gambling.games.poker.payouts.fullHouse}x** payout`, inline: true },
            { name: '🌊 Flush', value: `5 cards of same suit\n**${config.gambling.games.poker.payouts.flush}x** payout`, inline: true },
            { name: '📈 Straight', value: `5 consecutive cards\n**${config.gambling.games.poker.payouts.straight}x** payout`, inline: true },
            { name: '🎲 Three of a Kind', value: `Three cards of same rank\n**${config.gambling.games.poker.payouts.threeOfAKind}x** payout`, inline: true },
            { name: '👥 Two Pair', value: `Two pairs of different ranks\n**${config.gambling.games.poker.payouts.twoPair}x** payout`, inline: true },
            { name: '👫 One Pair', value: `Two cards of same rank\n**${config.gambling.games.poker.payouts.pair}x** payout`, inline: true },
            { name: '🃏 High Card', value: `No matching cards\n**${config.gambling.games.poker.payouts.highCard}x** payout (usually 0x)`, inline: true }
        )
        .setColor('#9B59B6')
        .setFooter({ text: 'Good luck at the tables! 🍀' });

    return interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

async function showBetSelection(interaction, game) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const economy = database.upsertEconomy(userId, guildId);
    
    const embed = new EmbedBuilder()
        .setTitle(`💰 Place Your Bet - ${getGameName(game)}`)
        .setDescription(
            `**Your Balance:** ${economy.money.toLocaleString()} coins\n\n` +
            `**Min Bet:** ${config.gambling.minBet} coins\n` +
            `**Max Bet:** ${config.gambling.maxBet.toLocaleString()} coins\n\n` +
            `Choose your bet amount:`
        )
        .setColor('#FFD700');

    // Create bet amount buttons
    const suggestedBets = [
        Math.max(config.gambling.minBet, 100),
        Math.max(config.gambling.minBet, 500),
        Math.max(config.gambling.minBet, 1000),
        Math.max(config.gambling.minBet, Math.floor(economy.money * 0.1)),
        Math.max(config.gambling.minBet, Math.floor(economy.money * 0.25))
    ].filter(bet => bet <= economy.money && bet <= config.gambling.maxBet);

    const buttons = new ActionRowBuilder();
    suggestedBets.slice(0, 4).forEach(bet => {
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_bet_${game}_${bet}_${userId}`)
                .setLabel(`${bet.toLocaleString()} coins`)
                .setStyle(ButtonStyle.Primary)
        );
    });

    buttons.addComponents(
        new ButtonBuilder()
            .setCustomId(`gambling_back_${userId}`)
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

// Helper functions
function getGameName(gameValue) {
    const gameNames = {
        'coinflip': '🪙 Coin Flip',
        'blackjack': '🃏 Blackjack',
        'poker': '🎰 Poker',
        'random': '🎲 Random Game'
    };
    return gameNames[gameValue] || gameValue;
}

function formatHandType(handType) {
    const handNames = {
        'royalFlush': '👑 Royal Flush',
        'straightFlush': '💎 Straight Flush',
        'fourOfAKind': '🎯 Four of a Kind',
        'fullHouse': '🏠 Full House',
        'flush': '🌊 Flush',
        'straight': '📈 Straight',
        'threeOfAKind': '🎲 Three of a Kind',
        'twoPair': '👥 Two Pair',
        'pair': '👫 One Pair',
        'highCard': '🃏 High Card'
    };
    return handNames[handType] || handType;
}

function createDeck() {
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push(`${rank}${suit}`);
        }
    }
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function drawCard(deck) {
    return deck.pop();
}

function drawCards(count) {
    const deck = createDeck();
    const cards = [];
    
    for (let i = 0; i < count; i++) {
        cards.push(drawCard(deck));
    }
    
    return cards;
}

function calculateBlackjackScore(cards) {
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
    
    // Check for flush (all same suit)
    const isFlush = suits.every(suit => suit === suits[0]);
    
    // Check for straight
    const rankOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const rankValues = ranks.map(rank => {
        if (rank === 'A') return [1, 14]; // Ace can be 1 or 14
        if (rank === 'J') return 11;
        if (rank === 'Q') return 12;
        if (rank === 'K') return 13;
        return parseInt(rank);
    });
    
    // Flatten and sort rank values
    const flatValues = rankValues.flat().sort((a, b) => a - b);
    
    // Check for straights
    let isStraight = false;
    for (let i = 0; i <= flatValues.length - 5; i++) {
        let consecutive = 1;
        for (let j = i + 1; j < flatValues.length; j++) {
            if (flatValues[j] === flatValues[j-1] + 1) {
                consecutive++;
                if (consecutive === 5) {
                    isStraight = true;
                    break;
                }
            } else if (flatValues[j] !== flatValues[j-1]) {
                break;
            }
        }
        if (isStraight) break;
    }
    
    // Determine hand type
    if (isStraight && isFlush) {
        // Check for royal flush (A, K, Q, J, 10 of same suit)
        if (ranks.includes('A') && ranks.includes('K') && ranks.includes('Q') && ranks.includes('J') && ranks.includes('10')) {
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
    
    return 'highCard';
}

async function startRandomGame(interaction, database) {
    const games = ['coinflip', 'blackjack', 'poker'];
    const randomGame = games[Math.floor(Math.random() * games.length)];
    
    const embed = new EmbedBuilder()
        .setTitle('🎲 Random Game Selected!')
        .setDescription(`Fate has chosen: **${getGameName(randomGame)}**`)
        .setColor('#FFD700');

    await interaction.update({
        embeds: [embed],
        components: []
    });

    // Wait a moment then start the selected game
    setTimeout(async () => {
        switch (randomGame) {
            case 'coinflip':
                return await startCoinFlip(interaction, database);
            case 'blackjack':
                return await startBlackjack(interaction, database);
            case 'poker':
                return await startPoker(interaction, database);
        }
    }, 1500);
}

async function showRules(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📖 Gambling Rules & Information')
        .setDescription('Welcome to the casino! Here are the rules and information for each game:')
        .addFields(
            {
                name: '🪙 Coin Flip',
                value: `• Simple 50/50 chance game\n• Choose heads or tails\n• Win: ${config.gambling.games.coinFlip.payout}x your bet\n• Lose: Lose your bet`,
                inline: false
            },
            {
                name: '🃏 Blackjack',
                value: `• Goal: Get as close to 21 without going over\n• Beat the dealer's hand\n• Blackjack (21 with 2 cards): ${config.gambling.games.blackjack.payout}x payout\n• Regular win: ${config.gambling.games.blackjack.payout}x payout`,
                inline: false
            },
            {
                name: '🎰 Poker',
                value: `• 5-card draw poker\n• Get the best hand possible\n• Payouts range from ${Math.min(...Object.values(config.gambling.games.poker.payouts))}x to ${Math.max(...Object.values(config.gambling.games.poker.payouts))}x\n• Use the help button for detailed hand rankings`,
                inline: false
            },
            {
                name: '💰 Betting Limits',
                value: `• Minimum bet: ${config.gambling.minBet} coins\n• Maximum bet: ${config.gambling.maxBet.toLocaleString()} coins`,
                inline: false
            }
        )
        .setColor('#9B59B6')
        .setFooter({ text: 'Good luck and gamble responsibly! 🍀' });

    return interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

async function handleBetSelection(interaction, database) {
    const [action, betAction, game, amount, targetUserId] = interaction.customId.split('_');
    
    if (interaction.user.id !== targetUserId) {
        return interaction.reply({
            content: '❌ This is not your gambling session!',
            ephemeral: true
        });
    }

    const betAmount = parseInt(amount);
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Validate bet
    const economy = database.upsertEconomy(userId, guildId);
    
    if (betAmount > economy.money) {
        return interaction.reply({
            content: `❌ You don't have enough coins! Your balance: ${economy.money.toLocaleString()} coins.`,
            ephemeral: true
        });
    }

    if (betAmount < config.gambling.minBet || betAmount > config.gambling.maxBet) {
        return interaction.reply({
            content: `❌ Bet must be between ${config.gambling.minBet} and ${config.gambling.maxBet.toLocaleString()} coins.`,
            ephemeral: true
        });
    }

    // Store bet and start game
    let userGame = activeGames.get(userId) || {};
    userGame.bet = betAmount;
    activeGames.set(userId, userGame);

    // Start the appropriate game
    switch (game) {
        case 'coinflip':
            return await startCoinFlip(interaction, database);
        case 'blackjack':
            return await startBlackjack(interaction, database);
        case 'poker':
            return await startPoker(interaction, database);
        default:
            return interaction.reply({
                content: '❌ Invalid game selection.',
                ephemeral: true
            });
    }
}

async function handleGamePlay(interaction, database) {
    const parts = interaction.customId.split('_');
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    if (interaction.user.id !== parts[parts.length - 1]) {
        return interaction.reply({
            content: '❌ This is not your gambling session!',
            ephemeral: true
        });
    }

    const gameType = parts[2];
    const action = parts[3];

    switch (gameType) {
        case 'coinflip':
            return await playCoinFlip(interaction, database, action);
        case 'blackjack':
            return await playBlackjackAction(interaction, database, action);
        case 'poker':
            if (action === 'help') {
                return await showPokerHelp(interaction);
            } else if (action === 'again') {
                return await startPoker(interaction, database);
            }
            break;
        default:
            return interaction.reply({
                content: '❌ Unknown game action.',
                ephemeral: true
            });
    }
}

async function playCoinFlip(interaction, database, choice) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const userGame = activeGames.get(userId);
    
    if (!userGame || !userGame.bet) {
        return interaction.reply({
            content: '❌ No active bet found. Please start a new game.',
            ephemeral: true
        });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;
    
    const winAmount = won ? Math.floor(userGame.bet * config.gambling.games.coinFlip.payout) : -userGame.bet;
    const newEconomy = database.updateMoney(userId, guildId, winAmount);
    
    const embed = new EmbedBuilder()
        .setTitle('🪙 Coin Flip Results')
        .setDescription(
            `**Your Choice:** ${choice.charAt(0).toUpperCase() + choice.slice(1)} ${choice === 'heads' ? '🟡' : '⚫'}\n` +
            `**Result:** ${result.charAt(0).toUpperCase() + result.slice(1)} ${result === 'heads' ? '🟡' : '⚫'}\n\n` +
            `${won ? '🎉 **You Won!**' : '💸 **You Lost!**'}\n` +
            `**Bet Amount:** ${userGame.bet.toLocaleString()} coins\n` +
            `**Amount Won/Lost:** ${winAmount > 0 ? '+' : ''}${winAmount.toLocaleString()} coins\n` +
            `**New Balance:** ${newEconomy.money.toLocaleString()} coins`
        )
        .setColor(won ? '#00FF00' : '#FF0000')
        .setFooter({ text: 'Thanks for playing! 🎰' });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_coinflip_${userId}`)
                .setLabel('🔄 Play Again')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_back_${userId}`)
                .setLabel('⬅️ Back to Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    // Clear the game data
    activeGames.delete(userId);

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

async function playBlackjackAction(interaction, database, action) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const userGame = activeGames.get(userId);
    
    if (!userGame || !userGame.blackjack) {
        return interaction.reply({
            content: '❌ No active blackjack game found.',
            ephemeral: true
        });
    }

    const { deck, playerHand, dealerHand } = userGame.blackjack;

    if (action === 'hit') {
        // Player hits
        playerHand.push(drawCard(deck));
        const playerScore = calculateBlackjackScore(playerHand);
        
        if (playerScore > 21) {
            // Player busts
            return await finishBlackjack(interaction, database, false, 'bust');
        } else {
            // Update game state
            userGame.blackjack.playerHand = playerHand;
            activeGames.set(userId, userGame);
            
            const embed = new EmbedBuilder()
                .setTitle('🃏 Blackjack - Your Turn')
                .setDescription(
                    `**Bet Amount:** ${userGame.bet} coins\n\n` +
                    `**Your Hand:** ${playerHand.join(' ')} **(${playerScore})**\n` +
                    `**Dealer:** ${dealerHand[0]} ❓\n\n` +
                    `What would you like to do?`
                )
                .setColor('#FFD700');

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gambling_play_blackjack_hit_${userId}`)
                        .setLabel('🃏 Hit')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`gambling_play_blackjack_stand_${userId}`)
                        .setLabel('✋ Stand')
                        .setStyle(ButtonStyle.Success)
                );

            return interaction.update({
                embeds: [embed],
                components: [buttons]
            });
        }
    } else if (action === 'stand') {
        // Player stands, dealer plays
        return await finishBlackjack(interaction, database, false, 'stand');
    }
}

async function finishBlackjack(interaction, database, isBlackjack = false, reason = '') {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const userGame = activeGames.get(userId);
    
    const { playerHand, dealerHand, deck } = userGame.blackjack;
    const playerScore = calculateBlackjackScore(playerHand);
    
    // Dealer plays (if player didn't bust)
    let dealerScore = calculateBlackjackScore(dealerHand);
    if (reason !== 'bust') {
        while (dealerScore < 17) {
            dealerHand.push(drawCard(deck));
            dealerScore = calculateBlackjackScore(dealerHand);
        }
    }
    
    // Determine winner
    let result, winAmount;
    
    if (isBlackjack) {
        result = '🎉 **BLACKJACK! You Win!**';
        winAmount = Math.floor(userGame.bet * config.gambling.games.blackjack.payout);
    } else if (playerScore > 21) {
        result = '💸 **Bust! You Lose!**';
        winAmount = -userGame.bet;
    } else if (dealerScore > 21) {
        result = '🎉 **Dealer Busts! You Win!**';
        winAmount = Math.floor(userGame.bet * config.gambling.games.blackjack.payout);
    } else if (playerScore > dealerScore) {
        result = '🎉 **You Win!**';
        winAmount = Math.floor(userGame.bet * config.gambling.games.blackjack.payout);
    } else if (playerScore === dealerScore) {
        result = '🤝 **Push! Tie Game!**';
        winAmount = 0;
    } else {
        result = '💸 **Dealer Wins!**';
        winAmount = -userGame.bet;
    }
    
    const newEconomy = database.updateMoney(userId, guildId, winAmount);
    
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack Results')
        .setDescription(
            `**Your Hand:** ${playerHand.join(' ')} **(${playerScore})**\n` +
            `**Dealer Hand:** ${dealerHand.join(' ')} **(${dealerScore})**\n\n` +
            `${result}\n` +
            `**Bet Amount:** ${userGame.bet.toLocaleString()} coins\n` +
            `**Amount Won/Lost:** ${winAmount > 0 ? '+' : ''}${winAmount.toLocaleString()} coins\n` +
            `**New Balance:** ${newEconomy.money.toLocaleString()} coins`
        )
        .setColor(winAmount > 0 ? '#00FF00' : winAmount === 0 ? '#FFFF00' : '#FF0000')
        .setFooter({ text: 'Thanks for playing! 🎰' });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`gambling_blackjack_${userId}`)
                .setLabel('🔄 Play Again')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`gambling_back_${userId}`)
                .setLabel('⬅️ Back to Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    // Clear the game data
    delete userGame.blackjack;
    activeGames.set(userId, userGame);

    return interaction.update({
        embeds: [embed],
        components: [buttons]
    });
}

export default {
    data,
    execute,
    handleButtonInteraction
};