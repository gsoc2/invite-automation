module.exports = handleStarringRepo;
const { Octokit } = require("@octokit/core");
const { createAppAuth } = require("@octokit/auth-app");
/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 * 
 * 
 */


async function checkForEmployee(user, octokit) {
  let employeeStatus
  const result = await octokit.request('GET /users/{username}', {
    username: user
  }).catch(async (err) => {
    if (err.status === 404) {
      console.log("no user found", err.status);
    }
  });
  if (result) {
    if (result.status === 200) {
      employeeStatus = result.data.site_admin
    }
  }
  console.log('employee status', employeeStatus)
  return employeeStatus
}

async function addUserToTeam(user, employeeStatus, octokit) {
  const team_slug = employeeStatus ? 'github-employees' : 'members';
  const result = await octokit.request('PUT /orgs/{org}/teams/{team_slug}/memberships/{username}', {
    org: 'maintainers',
    team_slug: team_slug,
    username: user,
    role: 'member',
  }).catch(async (err) => {
    if (err.status === 403) {
      console.log(`Forbidden ${err.status}`)
    }
    if (err.status === 422) {
      console.log(`Unprocessable Entity ${err.status}`);
    }
  }
  );
  if (result) {
    if (result.status === 200) {
      console.log("user added to team. Success:", result.status);
    }
  }
}

async function openIssue(user, octokit) {
  console.log('opening an issue')
  const result = await octokit.request('POST /repos/{owner}/{repo}/issues', {
    owner: 'maintainers',
    repo: 'invite-automation',
    labels: ['pending-invitation'],
    title: `Pending invitation request for: @${user}`,
    body: `Hi!  @${user}. Thanks for your interest in join this organization. To be added to this organization. Please respond with a comment below to the following questions. (Please note that failure to respond to all items will result in a closed issue):
- [ ] What is the name of the project you maintain?
- [ ] What is the URL to your GitHub repository?
- [ ] Why do you want to join the maintainers organization? (Please be specific)`,
  }).catch(err => {
    console.log('err', err)
    if (err.status === 403) {
      console.log(`Forbidden ${err.status}`)
    }
    if (err.status === 422) {
      console.log(`Unprocessable Entity ${err.status}`);
    }
  }
  );

  if (result === 201) {
    console.log("opened an issue", result);
  }
}

async function assignTeams(user, octokit) {
  const result = await octokit.request("GET /orgs/{org}/members/{username}", {
    username: user,
    org: "maintainers",
  }).catch(async (err) => {
    if (err.status === 404) {
      console.log("user is not a team member but part of the org", err.status);
      await openIssue(user, octokit);
    }
  });
  if (result) {
    if (result.status === 204) {
      console.log("user is part of org", result);
      const employeeStatus = await checkForEmployee(user, octokit);
      await addUserToTeam(user, employeeStatus, octokit);
    }
    if (result.status === 302) {
      console.log("user is not part of org", result);
      await openIssue(user, octokit);
    }
  }
}

async function handleStarringRepo(app, context) {
  const { appIdData, privateKeyData, clientIdData, clientSecretData } = await require("./ssm-handler");
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: await appIdData,
      privateKey: await privateKeyData,
      clientId: await clientIdData,
      clientSecret: await clientSecretData,
      installationId: context.payload.installation.id
    },
  });

  console.log(`the repo was starred by: ${context.payload.sender.login}`)
  const user = context.payload.sender.login
  if (user) {
    await assignTeams(user, octokit);
  }
}
