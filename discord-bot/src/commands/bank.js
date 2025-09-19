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
    console.error('Error loading config.json in bank command:', error.message);
    config = { gambling: { bank: { enabled: false } } };
}

export const data = new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Manage your secure bank account')
    .addSubcommand(subcommand =>
        subcommand
            .setName('info')
            .setDescription('View your bank account information'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('deposit')
            .setDescription('Deposit money into your bank')
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Amount to deposit')
                    .setMinValue(1)
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('withdraw')
            .setDescription('Withdraw money from your bank')
            .addIntegerOption(option =>
                option.setName('amount')
                    .setDescription('Amount to withdraw')
                    .setMinValue(1)
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('upgrade')
            .setDescription('Upgrade your bank to increase storage limit'));

export async function execute(interaction, database) {
    if (!config.gambling?.bank?.enabled) {
        return interaction.reply({
            content: '🚫 Banking system is currently disabled.',
            ephemeral: true
        });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();

    try {
        const economy = database.upsertEconomy(userId, guildId);

        switch (subcommand) {
            case 'info':
                return await handleBankInfo(interaction, database, economy);
            
            case 'deposit':
                const depositAmount = interaction.options.getInteger('amount');
                return await handleDeposit(interaction, database, depositAmount);
            
            case 'withdraw':
                const withdrawAmount = interaction.options.getInteger('amount');
                return await handleWithdraw(interaction, database, withdrawAmount);
            
            case 'upgrade':
                return await handleUpgrade(interaction, database);
            
            default:
                return interaction.reply({
                    content: '❌ Invalid bank operation.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in bank command:', error);
        return interaction.reply({
            content: '❌ An error occurred while accessing your bank account.',
            ephemeral: true
        });
    }
}

async function handleBankInfo(interaction, database, economy) {
    const bankLimit = database.getBankLimit(economy.bank_level);
    const maxLevel = config.gambling.bank.maxBankLevel;
    const upgradeCost = database.getBankUpgradeCost(economy.bank_level);
    const nextLimit = economy.bank_level < maxLevel ? database.getBankLimit(economy.bank_level + 1) : null;

    const embed = new EmbedBuilder()
        .setTitle('🏦 Your Bank Account')
        .setDescription(
            `💰 **Wallet:** ${economy.money} coins\n` +
            `🏦 **Bank:** ${economy.bank_money} / ${bankLimit} coins\n` +
            `📊 **Bank Level:** ${economy.bank_level} / ${maxLevel}`
        )
        .addFields(
            {
                name: '📈 Bank Usage',
                value: `${Math.round((economy.bank_money / bankLimit) * 100)}% full`,
                inline: true
            },
            {
                name: '🔒 Protection',
                value: 'Money in bank is safe from stealing',
                inline: true
            }
        )
        .setColor('#4CAF50');

    if (upgradeCost && economy.bank_level < maxLevel) {
        embed.addFields({
            name: '⬆️ Next Upgrade',
            value: `**Cost:** ${upgradeCost} coins\n**New Limit:** ${nextLimit} coins`,
            inline: false
        });
    } else if (economy.bank_level >= maxLevel) {
        embed.addFields({
            name: '👑 Maximum Level',
            value: 'Your bank is at maximum level!',
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /bank deposit, /bank withdraw, or /bank upgrade' });

    return interaction.reply({ embeds: [embed] });
}

async function handleDeposit(interaction, database, amount) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const result = database.depositMoney(userId, guildId, amount);

    if (!result.success) {
        let errorMessage = result.error;
        if (result.error === 'Bank limit exceeded') {
            errorMessage = `❌ Bank limit exceeded!\n\n` +
                `🏦 **Current Bank:** ${result.currentBank} coins\n` +
                `📊 **Bank Limit:** ${result.bankLimit} coins\n` +
                `💡 **Available Space:** ${result.bankLimit - result.currentBank} coins\n\n` +
                `Use \`/bank upgrade\` to increase your limit!`;
        }

        return interaction.reply({
            content: errorMessage,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('💰 Deposit Successful')
        .setDescription(
            `✅ **Deposited:** ${result.deposited} coins\n\n` +
            `💳 **New Wallet:** ${result.newWallet} coins\n` +
            `🏦 **New Bank:** ${result.newBank} coins`
        )
        .setColor('#00FF7F')
        .setFooter({ text: 'Your money is now safe from thieves!' });

    return interaction.reply({ embeds: [embed] });
}

async function handleWithdraw(interaction, database, amount) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const result = database.withdrawMoney(userId, guildId, amount);

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('💸 Withdrawal Successful')
        .setDescription(
            `✅ **Withdrawn:** ${result.withdrawn} coins\n\n` +
            `💳 **New Wallet:** ${result.newWallet} coins\n` +
            `🏦 **New Bank:** ${result.newBank} coins`
        )
        .setColor('#FFD700')
        .setFooter({ text: 'Money in your wallet can be stolen - consider keeping it banked!' });

    return interaction.reply({ embeds: [embed] });
}

async function handleUpgrade(interaction, database) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    const result = database.upgradeBankLevel(userId, guildId);

    if (!result.success) {
        let errorMessage = result.error;
        if (result.error === 'Insufficient funds for upgrade') {
            errorMessage = `❌ Insufficient funds!\n\n` +
                `💰 **Upgrade Cost:** ${result.cost} coins\n` +
                `💳 **Your Wallet:** ${database.getEconomy(userId, guildId).money} coins\n\n` +
                `You need ${result.cost - database.getEconomy(userId, guildId).money} more coins!`;
        }

        return interaction.reply({
            content: errorMessage,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎉 Bank Upgraded!')
        .setDescription(
            `✅ **New Bank Level:** ${result.newLevel}\n` +
            `📊 **New Limit:** ${result.newLimit} coins\n` +
            `💰 **Upgrade Cost:** ${result.cost} coins\n\n` +
            `💳 **New Wallet Balance:** ${result.newWallet} coins`
        )
        .setColor('#9C27B0')
        .setFooter({ text: 'Your bank can now store more coins safely!' });

    return interaction.reply({ embeds: [embed] });
}

export default {
    data,
    execute
};