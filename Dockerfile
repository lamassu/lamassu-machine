FROM lamassu/upboard-build:2.0 as build

WORKDIR lamassu-machine

RUN curl -sL https://ssubucket.ams3.digitaloceanspaces.com/deploy-files_2019.06.07.txz | xz -dc | tar -x 

# Prevent cache invalidation when we only change version numbers
COPY ["package.json", "package-lock.json", "./"]
RUN npm version --allow-same-version --git-tag-version false --commit-hooks false 1.0.0
RUN npm install
COPY . ./
RUN npm run build

RUN cp ./mock_data/device_config.sample.json ./device_config.json
run mkdir ./ui/css/fonts
RUN cp -r ./deploy-files/fonts/* ./ui/css/fonts/


# Runtime
FROM nginx:1.25.3-alpine

RUN apk add nodejs --update-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/main --allow-untrusted

WORKDIR lamassu-machine
COPY --from=build ./lamassu/lamassu-machine ./

RUN rm /etc/nginx/conf.d/default.conf
RUN cp -r ./ui /usr/share/nginx/html
COPY ./build-scripts/nginx.conf /etc/nginx/conf.d/
# Bignumber.js is a requirement
RUN mkdir /usr/share/nginx/html/ui/bignumber.js && cp ./node_modules/bignumber.js/bignumber.min.js /usr/share/nginx/html/ui/bignumber.js

VOLUME ./data

EXPOSE 80

RUN chmod +x ./entrypoint.sh

ENTRYPOINT [ "./entrypoint.sh" ]
