const core = require("@actions/core");
const axios = require("axios");
const DOCKERHUB_BASE_URL = "https://hub.docker.com/v2";

// inputs
const dockerhubUser = core.getInput("user");
const dockerhubReposStr = core.getInput("repos");
const dockerhubRepos = JSON.parse(dockerhubReposStr);
const substringsStr = core.getInput("substrings");
const substrings = substringsStr ? JSON.parse(substringsStr) : false;
const numberOfTagsToKeep = parseInt(core.getInput("keep-last"));
const forceFullCleanup = core.getInput("force-full-cleanup");

const token = core.getInput("token");
const username = dockerhubUser; //core.getInput("username");
const password = token; //core.getInput("password");

// logs
core.startGroup("Inputs");
core.info(`keep-last ${numberOfTagsToKeep}`);
core.info(`user ${dockerhubUser}`);
core.info(`repos ${dockerhubRepos}`);
core.info(`substrings ${substrings}`);
core.endGroup();

const getAPIToken = async (dockerHubUser, dockerHubPasswordOrPersonalToken) => {
  try {
    const {
      data: { token },
    } = await axios({
      method: "post",
      url: `${DOCKERHUB_BASE_URL}/users/login`,
      data: {
        username: dockerHubUser,
        password: dockerHubPasswordOrPersonalToken,
      },
    });

    return token;
  } catch (error) {
    core.setFailed(error);
  }
};

const dockerhubAPI = axios.create({
  baseURL: DOCKERHUB_BASE_URL,
});

dockerhubAPI.interceptors.request.use(
  async (config) => {
    core.startGroup("Bearer");

    if (username && password) {
      const token = await getAPIToken(username, password);

      core.info(`Using username / password: ${token}`);
      
      config.headers.Authorization = `Bearer ${token}`;
    } else {

      core.info(`Using token: ${token}`);

      config.headers.Authorization = `Bearer ${token}`;
    }

    core.endGroup();

    return config;
  },
  () => Promise.reject(error)
);

const byLastPushedDate = (a, b) =>
  new Date(b.last_updated) - new Date(a.last_updated);

const getAllCurrentTags = async (user, repo, currentTags, nextPage) => {
  tags = currentTags || [];
  const url = nextPage || `/repositories/${user}/${repo}/tags?page_size=100`;

  const {data} = await dockerhubAPI({
    url,
  });

  tags = [...tags, ...data.results];

  if (data.next) {
    return getAllCurrentTags(user, repo, tags, data.next);
  }

  return tags.sort(byLastPushedDate);
};

const shouldDeleteTag = (index, numbersToKeep, tag, substrings) => {
  if (index < numbersToKeep) {
    return false;
  }

  if (!substrings) {
    return true;
  }

  return substrings.some((substring) => {
    if (!substring) {
      core.warning(
        "You sent an empty substring, The empty substring has been ignored because this may have unexpected deletions, if you want to delete all old tags ommit this option"
      );
    }
    return substring && tag.name.includes(substring);
  });
};

const deleteSingleTag = (user, repo, tag) => {
  core.warning(`🟡 deleting ${tag} tag from ${user}/${repo}`);
  return dockerhubAPI({
    method: "DELETE",
    url: `/repositories/${user}/${repo}/tags/${tag}/`,
  })
    .then((response) => {
      core.info(`✅ successfully deleted ${tag} from ${user}/${repo}`);
      return response;
    })
    .catch((error) => {
      core.error(error);
      return Promise.reject(error);
    });
};

const getOldTags = (numbersToKeep, tags, substrings) => {
  // we are strongly assume that dockerhub api returns
  // the tags sorted by last_updated date (newest first)
  return tags
    .filter((tag, i) => shouldDeleteTag(i, numbersToKeep, tag, substrings))
    .map(({ name }) => name);
};

const cleanUpSingleRepo = async (
  numberOfTagsToKeep,
  dockerhubUser,
  dockerhubRepo,
  substrings
) => {
  // get all current tags
  const results = await getAllCurrentTags(dockerhubUser, dockerhubRepo);

  // get old tags
  const oldTags = getOldTags(numberOfTagsToKeep, results, substrings);
  core.warning(
    `about to delete ${oldTags.length} which are ${JSON.stringify(oldTags)}`
  );
  // create tag deletion promises
  const tagDeletionPromises = oldTags.map((tag) => {
    return deleteSingleTag(dockerhubUser, dockerhubRepo, tag);
  });

  // wait for all tag deletion promises to resolve
  return Promise.all(tagDeletionPromises);
};

const run = async () => {
  try {
    if (isNaN(numberOfTagsToKeep)) {
      throw 'Please be sure to set input "keep-last" as a number';
    }

    if (numberOfTagsToKeep < 1 && !forceFullCleanup) {
      throw 'To delete all Images please set input "force-full-cleanup" equals to true';
    }

    const reposCleanupPromises = dockerhubRepos.map((repo) => {
      return cleanUpSingleRepo(
        numberOfTagsToKeep,
        dockerhubUser,
        repo,
        substrings
      );
    });

    //wait for all repos cleanup
    await Promise.all(reposCleanupPromises);

    core.setOutput("success", true);
  } catch (error) {
    core.setFailed(error);
  }
};

run();
