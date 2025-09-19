import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
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
    console.error('Error loading config.json in admin-event command:', error.message);
    config = { events: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('admin-event')
    .setDescription('Admin-only event management commands')
    .addSubcommand(subcommand =>
        subcommand
            .setName('start')
            .setDescription('Start a seasonal event')
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('Type of event to start')
                    .setRequired(true)
                    .addChoices(
                        { name: '🐰 Easter Event', value: 'easter' },
                        { name: '🎄 Christmas Event', value: 'christmas' },
                        { name: '🎊 New Year Event', value: 'newyear' },
                        { name: '🎃 Halloween Event', value: 'halloween' },
                        { name: '☀️ Summer Event', value: 'summer' },
                        { name: '💝 Valentine\'s Event', value: 'valentine' }
                    ))
            .addIntegerOption(option =>
                option.setName('duration')
                    .setDescription('Duration in days (optional, uses default if not specified)')
                    .setMinValue(1)
                    .setMaxValue(30)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('end')
            .setDescription('End an active event')
            .addIntegerOption(option =>
                option.setName('event_id')
                    .setDescription('ID of the event to end')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all active events'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('rewards')
            .setDescription('Give event rewards to top performers')
            .addIntegerOption(option =>
                option.setName('event_id')
                    .setDescription('ID of the event to give rewards for')
                    .setRequired(true)));

export async function execute(interaction, database) {
    if (!config.events?.enabled) {
        return interaction.reply({
            content: '🚫 Events are currently disabled.',
            ephemeral: true
        });
    }

    // Check if user has admin role
    const adminRoleId = config.events.adminRoleId;
    const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
    const hasAdminPermission = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!hasAdminRole && !hasAdminPermission) {
        return interaction.reply({
            content: '❌ You need administrator permissions or the admin role to use this command.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
        switch (subcommand) {
            case 'start':
                return await handleStartEvent(interaction, database);
            
            case 'end':
                return await handleEndEvent(interaction, database);
            
            case 'list':
                return await handleListEvents(interaction, database);
            
            case 'rewards':
                return await handleGiveRewards(interaction, database);
            
            default:
                return interaction.reply({
                    content: '❌ Invalid admin event operation.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in admin-event command:', error);
        return interaction.reply({
            content: '❌ An error occurred while processing the admin event command.',
            ephemeral: true
        });
    }
}

async function handleStartEvent(interaction, database) {
    const eventType = interaction.options.getString('type');
    const customDuration = interaction.options.getInteger('duration');
    const guildId = interaction.guild.id;

    const eventConfig = config.events.eventTypes[eventType];
    if (!eventConfig) {
        return interaction.reply({
            content: '❌ Invalid event type.',
            ephemeral: true
        });
    }

    // Check if event is already active
    const activeEvents = database.getActiveEvents(guildId);
    const existingEvent = activeEvents.find(e => e.event_type === eventType);
    
    if (existingEvent) {
        return interaction.reply({
            content: `❌ ${eventConfig.name} is already active!`,
            ephemeral: true
        });
    }

    // Calculate dates
    const startDate = new Date();
    const duration = customDuration || eventConfig.duration;
    const endDate = new Date(startDate.getTime() + (duration * 24 * 60 * 60 * 1000));

    // Create event
    const result = database.createEvent(guildId, eventType, eventConfig.name, startDate.toISOString(), endDate.toISOString());
    
    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to create event: ${result.error}`,
            ephemeral: true
        });
    }

    // Send announcement
    await sendEventAnnouncement(interaction, eventConfig, startDate, endDate, 'start');

    const embed = new EmbedBuilder()
        .setTitle('✅ Event Started')
        .setDescription(
            `**${eventConfig.name}** has been started!\n\n` +
            `📅 **Duration:** ${duration} days\n` +
            `🏁 **Ends:** <t:${Math.floor(endDate.getTime() / 1000)}:R>\n` +
            `🆔 **Event ID:** ${result.eventId}`
        )
        .setColor(eventConfig.color)
        .setFooter({ text: 'Event announcement sent to event channel' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleEndEvent(interaction, database) {
    const eventId = interaction.options.getInteger('event_id');
    const guildId = interaction.guild.id;

    // Get event details
    const activeEvents = database.getActiveEvents(guildId);
    const event = activeEvents.find(e => e.id === eventId);

    if (!event) {
        return interaction.reply({
            content: '❌ Event not found or already ended.',
            ephemeral: true
        });
    }

    // End the event
    const result = database.endEvent(eventId);
    
    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to end event: ${result.error}`,
            ephemeral: true
        });
    }

    // Send announcement
    const eventConfig = config.events.eventTypes[event.event_type];
    await sendEventAnnouncement(interaction, eventConfig, null, null, 'end');

    const embed = new EmbedBuilder()
        .setTitle('✅ Event Ended')
        .setDescription(`**${event.event_name}** has been ended manually.`)
        .setColor('#FF6B6B')
        .setFooter({ text: 'Event end announcement sent to event channel' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleListEvents(interaction, database) {
    const guildId = interaction.guild.id;
    const activeEvents = database.getActiveEvents(guildId);

    if (activeEvents.length === 0) {
        return interaction.reply({
            content: '📅 No active events currently running.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📅 Active Events')
        .setColor('#00FF7F');

    let description = '';
    for (const event of activeEvents) {
        const endDate = new Date(event.end_date);
        description += `**${event.event_name}**\n`;
        description += `🆔 ID: ${event.id}\n`;
        description += `🏁 Ends: <t:${Math.floor(endDate.getTime() / 1000)}:R>\n\n`;
    }

    embed.setDescription(description);
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGiveRewards(interaction, database) {
    const eventId = interaction.options.getInteger('event_id');
    const guildId = interaction.guild.id;

    // Get event details
    const activeEvents = database.getActiveEvents(guildId);
    const event = activeEvents.find(e => e.id === eventId);

    if (!event) {
        return interaction.reply({
            content: '❌ Event not found.',
            ephemeral: true
        });
    }

    const eventConfig = config.events.eventTypes[event.event_type];
    const leaderboards = database.getEventLeaderboards(guildId);

    let rewardsGiven = 0;
    const rewardSummary = [];

    // Give rewards to top performers
    const categories = ['robbing', 'balance', 'level'];
    
    for (const category of categories) {
        const topUsers = leaderboards[category];
        const rewards = eventConfig.rewards.leaderboard[category];
        
        for (let i = 0; i < Math.min(topUsers.length, 3); i++) {
            const userId = topUsers[i].user_id;
            const coins = rewards[i];
            const position = i + 1;
            
            database.updateMoney(userId, guildId, coins);
            
            try {
                const user = await interaction.client.users.fetch(userId);
                rewardSummary.push(`${['🥇', '🥈', '🥉'][i]} **${user.displayName}** - ${category} (${coins} coins)`);
                rewardsGiven++;
            } catch (error) {
                console.error('Error fetching user:', error);
            }
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Event Rewards Distributed')
        .setDescription(
            `Rewards have been given to top performers in **${event.event_name}**!\n\n` +
            (rewardSummary.length > 0 ? rewardSummary.join('\n') : 'No eligible users found.')
        )
        .setColor(eventConfig.color)
        .setFooter({ text: `${rewardsGiven} rewards distributed` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function sendEventAnnouncement(interaction, eventConfig, startDate, endDate, type) {
    const eventChannelId = config.events.eventChannelId;
    const eventRoleId = config.events.eventRoleId;

    if (!eventChannelId) return;

    try {
        const eventChannel = await interaction.guild.channels.fetch(eventChannelId);
        if (!eventChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(type === 'start' ? `🎉 ${eventConfig.name} Started!` : `📅 ${eventConfig.name} Ended!`)
            .setDescription(
                type === 'start' ? 
                    `${eventConfig.description}\n\n` +
                    `🏁 **Ends:** <t:${Math.floor(endDate.getTime() / 1000)}:R>\n\n` +
                    `🎁 **Participation Rewards:**\n` +
                    `💰 ${eventConfig.rewards.participation.coins[0]}-${eventConfig.rewards.participation.coins[1]} coins\n` +
                    `🎯 Random items: ${eventConfig.rewards.participation.items.slice(0, 3).join(' ')}\n\n` +
                    `🏆 **Leaderboard Rewards for top 3:**\n` +
                    `🥷 Robbing: ${eventConfig.rewards.leaderboard.robbing.join('/')} coins\n` +
                    `💰 Balance: ${eventConfig.rewards.leaderboard.balance.join('/')} coins\n` +
                    `📈 Level: ${eventConfig.rewards.leaderboard.level.join('/')} coins` :
                    `Thank you for participating in **${eventConfig.name}**!\n\n` +
                    `Final rewards will be distributed to top performers soon.`
            )
            .setColor(eventConfig.color)
            .setTimestamp();

        const content = eventRoleId ? `<@&${eventRoleId}>` : '';
        
        await eventChannel.send({
            content,
            embeds: [embed]
        });
    } catch (error) {
        console.error('Error sending event announcement:', error);
    }
}

export default {
    data,
    execute
};