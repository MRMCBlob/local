import { SlashCommandBuilder, EmbedBuilder, InteractionResponseType } from 'discord.js';
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
    console.error('Error loading config.json in calendar command:', error.message);
    config = { events: { enabled: false } };
}

export const data = new SlashCommandBuilder()
    .setName('calendar')
    .setDescription('View current and upcoming events');

export async function execute(interaction, database) {
    if (!config.events?.enabled) {
        return interaction.reply({
            content: '🚫 Events are currently disabled.',
            flags: 64 // EPHEMERAL flag
        });
    }

    const guildId = interaction.guild.id;

    try {
        const activeEvents = database.getActiveEvents(guildId);
        const upcomingEvents = database.getUpcomingEvents(guildId, 5);

        const embed = new EmbedBuilder()
            .setTitle('📅 Event Calendar')
            .setColor('#4CAF50')
            .setTimestamp();

        // Active Events Section
        if (activeEvents.length > 0) {
            let activeDescription = '';
            for (const event of activeEvents) {
                const endDate = new Date(event.end_date);
                const eventConfig = config.events.eventTypes[event.event_type];
                
                activeDescription += `🎉 **${event.event_name}**\n`;
                activeDescription += `📝 ${eventConfig?.description || 'Special event'}\n`;
                activeDescription += `🏁 Ends: <t:${Math.floor(endDate.getTime() / 1000)}:R>\n\n`;
            }
            
            embed.addFields({
                name: '🔥 Active Events',
                value: activeDescription,
                inline: false
            });
        } else {
            embed.addFields({
                name: '🔥 Active Events',
                value: 'No events currently active.',
                inline: false
            });
        }

        // Upcoming Events Section
        if (upcomingEvents.length > 0) {
            let upcomingDescription = '';
            for (const event of upcomingEvents) {
                const startDate = new Date(event.start_date);
                upcomingDescription += `📅 **${event.event_name}**\n`;
                upcomingDescription += `🚀 Starts: <t:${Math.floor(startDate.getTime() / 1000)}:R>\n\n`;
            }
            
            embed.addFields({
                name: '⏰ Upcoming Events',
                value: upcomingDescription,
                inline: false
            });
        }

        // Seasonal Events Info
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentDay = now.getDate();
        const currentDateStr = `${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;

        const seasonalEvents = getSeasonalEventsInfo(currentDateStr);
        if (seasonalEvents.length > 0) {
            let seasonalDescription = '';
            for (const eventInfo of seasonalEvents) {
                seasonalDescription += `${eventInfo.icon} **${eventInfo.name}**\n`;
                seasonalDescription += `📅 ${eventInfo.timeframe}\n\n`;
            }
            
            embed.addFields({
                name: '🌟 Seasonal Events',
                value: seasonalDescription,
                inline: false
            });
        }

        // Event Participation Tips
        embed.addFields({
            name: '💡 How to Participate',
            value: 
                '• 💬 **Chat & Level Up** - Gain XP during events\n' +
                '• 🎮 **Play Games** - Use gambling commands\n' +
                '• 🥷 **Rob Users** - Climb the robbing leaderboard\n' +
                '• 💰 **Build Wealth** - Grow your balance\n' +
                '• 🏆 **Top 3 in each category get special rewards!**',
            inline: false
        });

        return interaction.reply({ 
            embeds: [embed], 
            flags: 64 // EPHEMERAL flag
        });

    } catch (error) {
        console.error('Error in calendar command:', error);
        return interaction.reply({
            content: '❌ An error occurred while fetching event information.',
            flags: 64 // EPHEMERAL flag
        });
    }
}

function getSeasonalEventsInfo(currentDateStr) {
    const seasonalEvents = [];
    const eventTypes = config.events.eventTypes;

    for (const [key, eventConfig] of Object.entries(eventTypes)) {
        const dates = eventConfig.dates;
        if (dates && dates.length >= 2) {
            const startDate = dates[0];
            const endDate = dates[1];
            
            // Check if we're in the seasonal window
            if (isDateInRange(currentDateStr, startDate, endDate)) {
                seasonalEvents.push({
                    name: eventConfig.name,
                    icon: eventConfig.name.split(' ')[0],
                    timeframe: `${startDate} to ${endDate}`,
                    inSeason: true
                });
            } else {
                // Check if it's coming up soon (within 30 days)
                const daysUntil = getDaysUntilDate(currentDateStr, startDate);
                if (daysUntil >= 0 && daysUntil <= 30) {
                    seasonalEvents.push({
                        name: eventConfig.name,
                        icon: eventConfig.name.split(' ')[0],
                        timeframe: `Starts in ${daysUntil} days`,
                        inSeason: false
                    });
                }
            }
        }
    }

    return seasonalEvents.slice(0, 3); // Limit to 3 most relevant
}

function isDateInRange(currentDate, startDate, endDate) {
    // Simple MM-DD comparison
    const current = currentDate.replace('-', '');
    const start = startDate.replace('-', '');
    const end = endDate.replace('-', '');
    
    if (start <= end) {
        return current >= start && current <= end;
    } else {
        // Spans year boundary (like Dec-Jan)
        return current >= start || current <= end;
    }
}

function getDaysUntilDate(currentDate, targetDate) {
    const now = new Date();
    const [currentMonth, currentDay] = currentDate.split('-').map(Number);
    const [targetMonth, targetDay] = targetDate.split('-').map(Number);
    
    const currentYear = now.getFullYear();
    let targetYear = currentYear;
    
    const target = new Date(targetYear, targetMonth - 1, targetDay);
    const current = new Date(currentYear, currentMonth - 1, currentDay);
    
    if (target < current) {
        targetYear++;
        target.setFullYear(targetYear);
    }
    
    const diffTime = target - current;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

export default {
    data,
    execute
};