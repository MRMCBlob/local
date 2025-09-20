import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    const configPath = join(__dirname, '../../config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json in colorpicker:', error.message);
    config = { colors: { enabled: false } };
}

export default {
    data: new SlashCommandBuilder()
        .setName('colorpicker')
        .setDescription('Manage your color roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('select')
                .setDescription('Choose a color role from the dropdown menu')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('View your current color role')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove your current color role')
        ),

    async execute(interaction, database) {
        const subcommand = interaction.options.getSubcommand();

        // Check if color system is enabled
        if (!config.colors?.enabled) {
            return interaction.reply({
                content: '❌ The color picker system is currently disabled.',
                ephemeral: true
            });
        }

        switch (subcommand) {
            case 'select':
                await handleColorSelect(interaction);
                break;
            case 'current':
                await handleCurrentColor(interaction);
                break;
            case 'remove':
                await handleRemoveColor(interaction);
                break;
        }
    },

    async handleColorSelection(interaction, selectedColorKey) {
        try {
            const member = interaction.member;
            const guild = interaction.guild;
            const colorConfig = config.colors.colors[selectedColorKey];

            if (!colorConfig) {
                return interaction.reply({
                    content: '❌ Invalid color selection.',
                    ephemeral: true
                });
            }

            // Get the role
            const role = guild.roles.cache.get(colorConfig.roleId);
            if (!role) {
                return interaction.reply({
                    content: `❌ Color role "${colorConfig.name}" not found. Please contact an administrator.`,
                    ephemeral: true
                });
            }

            // Remove other color roles if configured to do so
            if (config.colors.removeOtherColors) {
                const otherColorRoles = Object.values(config.colors.colors)
                    .map(color => color.roleId)
                    .filter(roleId => roleId !== colorConfig.roleId && roleId !== 'YOUR_' + selectedColorKey.toUpperCase() + '_ROLE_ID');

                for (const roleId of otherColorRoles) {
                    const otherRole = guild.roles.cache.get(roleId);
                    if (otherRole && member.roles.cache.has(roleId)) {
                        await member.roles.remove(otherRole);
                    }
                }
            }

            // Check if user already has this role
            if (member.roles.cache.has(colorConfig.roleId)) {
                return interaction.reply({
                    content: `You already have the ${colorConfig.icon} **${colorConfig.name}** color role!`,
                    ephemeral: true
                });
            }

            // Add the new color role
            await member.roles.add(role);

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('🎨 Color Role Updated!')
                .setDescription(`You now have the ${colorConfig.icon} **${colorConfig.name}** color role!\n\n${colorConfig.description}`)
                .setColor(parseInt(colorConfig.hexColor.replace('#', ''), 16))
                .setThumbnail(member.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'Color Picker System' });

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling color selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while updating your color role. Please try again later.',
                ephemeral: true
            });
        }
    }
};

async function handleColorSelect(interaction) {
    try {
        // Create dropdown menu with all available colors
        const options = [];
        
        for (const [key, color] of Object.entries(config.colors.colors)) {
            // Skip unconfigured roles
            if (color.roleId.startsWith('YOUR_')) continue;
            
            options.push({
                label: color.name,
                description: color.description,
                value: key,
                emoji: color.icon
            });
        }

        if (options.length === 0) {
            return interaction.reply({
                content: '❌ No color roles are currently configured. Please contact an administrator.',
                ephemeral: true
            });
        }

        // Split options into chunks of 25 (Discord's limit)
        const chunks = [];
        for (let i = 0; i < options.length; i += 25) {
            chunks.push(options.slice(i, i + 25));
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`color_select_${interaction.user.id}`)
            .setPlaceholder('🎨 Choose your color role!')
            .addOptions(chunks[0]); // Use first chunk (up to 25 colors)

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🎨 Color Role Picker')
            .setDescription('Choose a color role from the dropdown menu below!\n\n' +
                '✨ **Available Colors:**\n' +
                Object.entries(config.colors.colors)
                    .filter(([key, color]) => !color.roleId.startsWith('YOUR_'))
                    .map(([key, color]) => `${color.icon} **${color.name}** - ${color.description}`)
                    .join('\n'))
            .setColor(0x7289DA)
            .setThumbnail(interaction.guild.iconURL())
            .setFooter({ text: 'Select a color from the dropdown below!' });

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleColorSelect:', error);
        await interaction.reply({
            content: '❌ An error occurred while loading the color picker.',
            ephemeral: true
        });
    }
}

async function handleCurrentColor(interaction) {
    try {
        const member = interaction.member;
        
        // Find which color role the user has
        let currentColor = null;
        for (const [key, color] of Object.entries(config.colors.colors)) {
            if (color.roleId.startsWith('YOUR_')) continue;
            
            if (member.roles.cache.has(color.roleId)) {
                currentColor = { key, ...color };
                break;
            }
        }

        if (!currentColor) {
            const embed = new EmbedBuilder()
                .setTitle('🎨 Current Color Role')
                .setDescription('You don\'t have any color role assigned.\n\nUse `/colorpicker select` to choose one!')
                .setColor(0x99AAB5)
                .setThumbnail(member.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'Color Picker System' });

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        // Get the role to mention it
        const role = interaction.guild.roles.cache.get(currentColor.roleId);
        const roleMention = role ? role.toString() : currentColor.name;

        const embed = new EmbedBuilder()
            .setTitle('🎨 Your Current Color Role')
            .setDescription(`You currently have the ${currentColor.icon} **${currentColor.name}** color role!\n\n` +
                `**Role:** ${roleMention}\n` +
                `**Description:** ${currentColor.description}\n` +
                `**Color Code:** \`${currentColor.hexColor}\``)
            .setColor(parseInt(currentColor.hexColor.replace('#', ''), 16))
            .setThumbnail(member.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Color Picker System' });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleCurrentColor:', error);
        await interaction.reply({
            content: '❌ An error occurred while checking your current color role.',
            ephemeral: true
        });
    }
}

async function handleRemoveColor(interaction) {
    try {
        const member = interaction.member;
        let removedColors = [];

        // Remove all color roles
        for (const [key, color] of Object.entries(config.colors.colors)) {
            if (color.roleId.startsWith('YOUR_')) continue;
            
            if (member.roles.cache.has(color.roleId)) {
                const role = interaction.guild.roles.cache.get(color.roleId);
                if (role) {
                    await member.roles.remove(role);
                    removedColors.push(color);
                }
            }
        }

        if (removedColors.length === 0) {
            return interaction.reply({
                content: 'You don\'t have any color roles to remove!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Color Role Removed')
            .setDescription(`Successfully removed your color role${removedColors.length > 1 ? 's' : ''}:\n\n` +
                removedColors.map(color => `${color.icon} **${color.name}**`).join('\n'))
            .setColor(0x99AAB5)
            .setThumbnail(member.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Color Picker System' });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in handleRemoveColor:', error);
        await interaction.reply({
            content: '❌ An error occurred while removing your color role.',
            ephemeral: true
        });
    }
}