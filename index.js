const path = require('node:path'); 
const fs = require('node:fs');
const steamcmd = require('steamcmd');
const Enmap = require("enmap");
const {Client, EmbedBuilder} = require('discord.js');

const config = require('./config.json');

let saved_branches = new Enmap({name: "branches"});

function difference(setA, setB) {
	const _difference = new Set(setA);
	for (const elem of setB) {
	  _difference.delete(elem);
	}
	return _difference;
}
  
const client = new Client({
    intents: [32767],
    allowedMentions: {
        parse: ["users"],
        repliedUser: true
    },
    partials: ["CHANNEL", "GUILD_MEMBER", "MESSAGE", "REACTION", "USER"]
});

let patchnotes_channel = null

client.on('ready', async (guild) => {
	console.log(`Logged in as ${client.user.tag}!`);

	const channel = await guild.channels.cache.find(channel => channel.name === "noita-updates");

	if (!channel) return console.error("The channel does not exist!");

	// run main every 10 minutes
	if(channel){
		patchnotes_channel = channel
		main()
		setInterval(main, 1 * 60 * 1000);
	}
});

function findLastNewline(text, maxLength) {
	let lastNewlineIndex = maxLength;
	while (text.charAt(lastNewlineIndex) !== '\n' && lastNewlineIndex > 0) {
	  lastNewlineIndex--;
	}
	return lastNewlineIndex;
}

function splitStringAtNewLine(inputText, maxLength) {
	let remainingText = inputText;
	let chunks = [];

	// Continue looping until there's no more text left
	while (remainingText.length > 0) {
		// Find the last newline before maxLength
		let lastNewlineIndex = findLastNewline(remainingText, maxLength);

		// If there's no newline found, slice at maxLength
		if (lastNewlineIndex === 0) {
		lastNewlineIndex = maxLength;
		}

		// Slice the chunk and add it to the array
		let chunk = remainingText.slice(0, lastNewlineIndex);
		chunks.push(chunk);

		// Remove the sliced chunk from the remaining text
		remainingText = remainingText.slice(lastNewlineIndex + 1); // +1 to exclude the newline character
	}

	return chunks;
}

async function main(){
	let data = await steamcmd.getAppInfo(881100);
	let branches = data.depots.branches
	let was_public_updated = false
	// loop through the branches
	for (let branch in branches){
		
		// get the branch info
		let buildid = branches[branch].buildid
		let timeupdated = branches[branch].timeupdated
		
		let was_branch_updated = false
		let is_password_locked = branches[branch].pwdrequired != null

		// check if the branch is already in the database
		if (saved_branches.has(branch)){
			// get the branch info from the database
			let branchInfo = saved_branches.get(branch)
			// check if the buildid is different
			if (branchInfo.buildid != buildid){
				// update the branch info
				saved_branches.set(branch, {buildid: buildid, timeupdated: timeupdated})
				// do something with the branch
				console.log(`Branch ${branch} has been updated to build ${buildid}`)
				was_branch_updated = true
			}
		} else {
			// add the branch to the database
			saved_branches.set(branch, {buildid: buildid, timeupdated: timeupdated})
			// do something with the branch
			console.log(`Branch ${branch} has been added with build ${buildid}`)
			was_branch_updated = true
		}

		if (was_branch_updated && !is_password_locked){

			if(branch == "noitabeta" && was_public_updated){
				console.log(`Skipping branch ${branch} because public branch was updated`)
				continue
			}

			// get root directory of this node project
			let root_dir = __dirname
			let branch_dir = path.join(root_dir, "branches", branch)

			let new_branch_dir = path.join(branch_dir, "new")
			let old_branch_dir = path.join(branch_dir, "old")
			// check if old branch directory exists
			if (fs.existsSync(old_branch_dir)){
				// delete old branch directory
				console.log(`Deleting old branch directory ${old_branch_dir}`)
				fs.rmSync(old_branch_dir, { recursive: true })
			}

			// check if new branch directory exists
			if (fs.existsSync(new_branch_dir)){
				// rename new branch directory to old branch directory
				console.log(`Renaming new branch directory ${new_branch_dir} to ${old_branch_dir}`)
				fs.renameSync(new_branch_dir, old_branch_dir)
			}

			console.log(`Installing branch to ${path.join(branch_dir, "new")}`)
			if(branch != "public"){
				await steamcmd.updateApp(881100, path.join(branch_dir, "new"), ["-beta " + branch])
			} else {
				was_public_updated = true
				await steamcmd.updateApp(881100, path.join(branch_dir, "new"))
			}
			console.log(`Branch ${branch} has been updated`)

			// check if old branch directory exists
			if (fs.existsSync(old_branch_dir)){
				// take the _release_notes.txt file from the old branch directory
				// compare it to the _release_notes.txt file from the new branch directory
				// mark the differences
				// save the differences to a file
				
				//check if old and new release notes exist
				if (fs.existsSync(path.join(old_branch_dir, "_release_notes.txt")) && fs.existsSync(path.join(new_branch_dir, "_release_notes.txt"))){


					const old_release_notes = fs.readFileSync(path.join(old_branch_dir, "_release_notes.txt"), 'utf8')
					const new_release_notes = fs.readFileSync(path.join(new_branch_dir, "_release_notes.txt"), 'utf8')

					const old_content_lines = old_release_notes.split("\n")
					const new_content_lines = new_release_notes.split("\n")
				
					const added_lines = difference(new Set(new_content_lines), new Set(old_content_lines))

					// make empty diff file

					let differences = []
					// write added lines to diff file
					for (let line of added_lines){
						differences.push(line)
						//fs.appendFileSync(diff_file, line + "\n")
					}
					
					const section_types = {
						"FEATURE: Spell": "SPELLS",
						"FEATURE: New perk": "PERKS",
						"FEATURE: Perk": "PERKS",	
						"BUGFIX:": "BUG FIXES",
						"MODDING:": "MODDING",
					}

					let sections = {
						"GENERAL": [],
						"SPELLS": [],
						"PERKS": [],
						"BUG FIXES": [],
						"MODDING": [],
					}

					for (let line of differences){
						let section_found = false
						// check if line starts with a section type
						for (let section_type in section_types){
							if (line.startsWith(section_type)){
								// add line to section
								sections[section_types[section_type]].push(line)
								section_found = true
							}
						}
						// if no section was found, add line to general section
						if (!section_found){
							line = line.trim()
							if (line.startsWith("*") && line.endsWith("*")){
								continue
							}

							if (line.match(/202[0-9]/)){
								continue
							}
							sections["GENERAL"].push(line)
						}
					}

					let patchnotes_file = path.join(branch_dir, "patchnotes.txt")

					// get current data, convert to format "Jun 6 2023"
					let date = new Date()
					let date_string = date.toLocaleString('default', { month: 'short' }) + " " + date.getDate() + " " + date.getFullYear()

					let content = `# RELEASE NOTES - ${date_string}\n\n`

					// write the patchnotes file
					fs.writeFileSync(patchnotes_file, `RELEASE NOTES - ${date_string}\n\n`)
					for (let section in sections){
						if (sections[section].length > 0){
							content += `**${section}**\n`
							fs.appendFileSync(patchnotes_file, `*${section}*\n`)
							for (let line of sections[section]){
								content += "- "+line + "\n"
								fs.appendFileSync(patchnotes_file, line + "\n")
							}
							content += "\n"
							fs.appendFileSync(patchnotes_file, "\n")
						}
					}

					// create embed
					const embed = new EmbedBuilder()
					embed.setTitle(`Branch ${branch} has been updated`)
					
					// send message with embed, and patchnotes content
					
					
					patchnotes_channel.send({embeds: [embed]}).then(message => {
						message.crosspost()
						.then(() => console.log('Crossposted message'))
						.catch(console.error);
					})

					// split content into 2000 character chunks, make sure to only split and line endings
					let chunks = splitStringAtNewLine(content, 2000)
					for (let chunk of chunks){
						patchnotes_channel.send(chunk).then(message => {
							message.crosspost()
							.then(() => console.log('Crossposted message'))
							.catch(console.error);
						})
					}
				}
				else
				{
					const embed = new EmbedBuilder()
					embed.setTitle(`Branch ${branch} has been updated`)
					patchnotes_channel.send({embeds: [embed]}).then(message => {
						message.crosspost()
						.then(() => console.log('Crossposted message'))
						.catch(console.error);
					})
				}
			}
		}else if(was_branch_updated){
			const embed = new EmbedBuilder()
			embed.setTitle(`Branch ${branch} has been updated`)
			patchnotes_channel.send({embeds: [embed]}).then(message => {
				message.crosspost()
				.then(() => console.log('Crossposted message'))
				.catch(console.error);
			})
		}else{
			console.log(`Branch ${branch} is up to date`)
		}
	}
}

client.login(config.token)