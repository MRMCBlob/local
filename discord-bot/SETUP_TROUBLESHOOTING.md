# Discord Bot Setup & Troubleshooting Guide

## ❌ "Missing Access" Error (Code 50001)

This error means your bot doesn't have the necessary permissions to register slash commands. Here's how to fix it:

### 1. Check Bot Permissions in Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application (ID: 1418338239831609467)
3. Go to **Bot** section
4. Make sure these permissions are enabled:
   - ✅ **Send Messages**
   - ✅ **Use Slash Commands** 
   - ✅ **Embed Links**
   - ✅ **Read Message History**
   - ✅ **View Channels**
   - ✅ **Manage Roles** (for level rewards)

### 2. Check Bot Server Permissions

1. In your Discord server, go to **Server Settings** → **Roles**
2. Find your bot's role
3. Make sure it has these permissions:
   - ✅ **Send Messages**
   - ✅ **Use Slash Commands**
   - ✅ **Embed Links** 
   - ✅ **Read Message History**
   - ✅ **View Channels**
   - ✅ **Manage Roles** (for level rewards)

### 3. Re-invite Bot with Correct Permissions

If the above doesn't work, re-invite your bot with the correct permissions:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application → **OAuth2** → **URL Generator**
3. Select these scopes:
   - ✅ **bot**
   - ✅ **applications.commands**
4. Select these bot permissions:
   - ✅ **Send Messages**
   - ✅ **Use Slash Commands**
   - ✅ **Embed Links**
   - ✅ **Read Message History** 
   - ✅ **View Channels**
   - ✅ **Manage Roles**
5. Copy the generated URL and invite the bot again

### 4. Alternative: Deploy Globally Instead of Guild-Specific

If you want to deploy commands globally (all servers), modify `src/deploy-commands.js`:

Replace line 46:
```javascript
Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
```

With:
```javascript
Routes.applicationCommands(process.env.CLIENT_ID),
```

**Note:** Global commands take up to 1 hour to update, while guild commands update instantly.

### 5. Verify Bot Token

Make sure your bot token in `.env` is correct and the bot is online:

1. Check Discord Developer Portal → Bot → Token
2. Regenerate token if needed
3. Update `.env` file with new token

## ✅ Success Indicators

When everything is working correctly, you should see:
```
✅ Loaded command: leaderboard
✅ Loaded command: level
🚀 Started refreshing 2 application (/) commands.
✅ Successfully reloaded 2 application (/) commands.
```

## 🔧 Testing Commands

Once deployed successfully:
1. Type `/level` in your Discord server
2. Type `/leaderboard` in your Discord server
3. Send some messages to gain XP
4. Check your level progress!

## 📞 Still Having Issues?

1. **Check bot is online** in your server member list
2. **Verify CLIENT_ID** matches your application ID
3. **Verify GUILD_ID** matches your server ID (enable Developer Mode → right-click server → Copy Server ID)
4. **Check Discord status**: https://discordstatus.com/
5. **Try deploying to a test server** first