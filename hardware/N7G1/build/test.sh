company="Lamassu, Inc."
city=Manchester
country=US
state=

location=$([ -n "$state" ] && echo "$city, $state" || echo "$city")
machine_info="{\"owner\": \"$company / $location / $country\"}"

echo $machine_info