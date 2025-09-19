import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];

// Grab all the command files from the commands directory
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load commands
for (const file of commandFiles) {
    const commandPath = join(commandsPath, file);
    try {
        // Convert Windows path to file:// URL for ESM import
        const commandUrl = new URL('file:///' + commandPath.replace(/\\/g, '/'));
        const commandModule = await import(commandUrl);
        const command = commandModule.default;
        
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`❌ The command at ${commandPath} is missing a required "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands globally (this often works when guild commands don't)
(async () => {
    try {
        console.log(`\n🌍 Started refreshing ${commands.length} global application (/) commands.`);
        console.log('⏰ Note: Global commands can take up to 1 hour to appear in Discord.');

        // Deploy globally instead of to a specific guild
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully deployed ${data.length} global application (/) commands.`);
        console.log('\n📝 Deployed commands:');
        data.forEach(cmd => console.log(`   • /${cmd.name} - ${cmd.description}`));
        console.log('\n🎉 Commands will be available globally in up to 1 hour!');
        
    } catch (error) {
        console.error('❌ Error deploying global commands:', error);
        console.log('\n🔧 If this fails, try the troubleshooting steps in SETUP_TROUBLESHOOTING.md');
    }
})();