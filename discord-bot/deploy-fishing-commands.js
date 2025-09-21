import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];

// Load all command files
const commandsPath = join(__dirname, 'src', 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('Loading commands...');

for (const file of commandFiles) {
    const commandPath = join(commandsPath, file);
    const commandUrl = new URL('file:///' + commandPath.replace(/\\/g, '/'));
    
    try {
        const commandModule = await import(commandUrl);
        const command = commandModule.default;
        
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️  [WARNING] The command at ${file} is missing a required "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error.message);
    }
}

console.log(`\nLoaded ${commands.length} commands.`);

// Deploy commands
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
    console.log(`\n🚀 Started refreshing ${commands.length} application (/) commands.`);

    // For guild-specific deployment (faster, for testing)
    if (process.env.DISCORD_GUILD_ID) {
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
            { body: commands },
        );
        console.log(`✅ Successfully reloaded ${data.length} guild application (/) commands.`);
    } else {
        // For global deployment (slower, takes up to 1 hour to update)
        const data = await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands },
        );
        console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
    }

    console.log('\n🎉 All commands deployed successfully!');
    console.log('\nNew fishing commands available:');
    console.log('• /fish [rod] [weather] - Cast your line and catch fish!');
    console.log('• /sell - Sell all your caught fish for coins!');
    console.log('\nOther updated commands:');
    console.log('• /gambling - Interactive gambling games (improved)');
    
} catch (error) {
    console.error('❌ Error deploying commands:', error);
}