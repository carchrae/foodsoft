
docker run --name local-postgres -p5432:5432 -e POSTGRES_PASSWORD=root postgres:9.5 || docker container start local-postgres