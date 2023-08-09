# Action-DockerHub-Cleanup

Delete your older tags / images from Docker Hub inside a Github Action.

Generate a [Docker Token](https://hub.docker.com/settings/security), add it to your secret.

Fork from [m3ntorship/action-dockerhub-cleanup](https://github.com/m3ntorship/action-dockerhub-cleanup) which wasn't working (on my end at least).

## Usage

Delete every images except the last one you pushed

```
- uses: starburst997/action-dockerhub-cleanup@master
  with:
    user: 'my-username'
    token: ${{ secrets.DOCKER_TOKEN }}
    repos: '["my-repo"]'
    keep-last: 1
```