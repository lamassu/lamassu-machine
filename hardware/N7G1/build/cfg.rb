# pull in info, generate JSON
require 'json'
require 'csv'
require 'fileutils'
require 'open-uri'
require 'securerandom'
require 'unix_crypt'

def process(path, ssn, owner, currency, locales)
	rec = {
		:brain => {
			:unit => {
				:ssn => ssn,
				:owner => owner
			},
			:locale => {
				:currency => currency,
				:localeInfo => {
					:primaryLocale => locales.first,
					:primaryLocales => locales
				}
			}
		}
	}

	File.open("#{path}/unit_config.json", 'w') do |f|
		f.puts JSON.pretty_generate(rec)
	end
end

def fetch_config(ssn)
	old_fn = '/Users/josh/Documents/lamassu/n7/archive/build-2014-04-06/' + ssn + '/user_config.json'
	if File.exists? old_fn
		cfg = JSON.parse(open(old_fn).read);
		blockchain = cfg['exchanges']['plugins']['settings']['blockchain']
		if (blockchain) then return blockchain end
	end

	pass = SecureRandom.hex 32
	api_code = '423ddc8f-3c67-421e-9a60-7c7ce78abcf6'
	url = %{https://blockchain.info/api/v2/create_wallet?password=#{pass}&api_code=#{api_code}}
	res = JSON.parse(open(url).read);
	return { 'guid' => res['guid'], 'fromAddress' => res['address'], 'password' => pass }
end

def user_config(ssn, path, commission)
	blockchain = fetch_config(ssn)
	rec = {
	 :exchanges => {
	   :settings => {
	     :commission => commission
	    },
	   :plugins => {
	     :current => {
	       :ticker => "bitpay_ticker",
	       :trade => nil,
	       :transfer => "blockchain"
	      },
	     :settings => {
	       :blockchain => {
	         :fromAddress => blockchain['fromAddress'],
	         :password => blockchain['password'],
	         :guid => blockchain['guid']
	        }
	      }
	    }
	  }
	}

	File.open("#{path}/user_config.json", 'w') do |f|
		f.puts JSON.pretty_generate(rec)
	end
end

#FileUtils.mv "#{Dir.home}/Downloads/Invoicing Info - 04 - Sheet1.csv", "companies.csv"

# Clean up flash drive
FileUtils.rm Dir.glob('/Volumes/ssutran/sign/update.*')

count = 0
o = 4 	# offset
CSV.foreach('companies.csv', { :headers => true, :return_headers => false }) do |row|
	ssn = row[o] && row[o].strip
	commission = row[o+1].to_f
	limit = row[o+2].to_f
	limit = nil if limit == 0.0
	company = row[o+3] && row[o+3].strip
	country = row[o+4] && row[o+4].strip
	country_code = row[o+5] && row[o+5].strip
	city = row[o+6] && row[o+6].strip
	state = row[o+7] && row[o+7].strip
	currency = row[o+8] && row[o+8].strip
	locale_txt = row[o+9]

	if !(city && currency && locale_txt)
		puts "Skipping #{ssn} (missing fields)"
		next
	end

	location = state ? "#{city}, #{state}" : city
	owner = "#{company} / #{location} / #{country}"
	
	# check for existing ssn, create path
	path = "/Users/josh/Documents/lamassu/n7/build/#{ssn}"
	
	cfg_path = "#{path}/unit_config.json"
#	next if File.exists? cfg_path

	if File.exist? path
		puts "Skipping #{ssn} (already exists)"
		next
	end
	
	puts "#{ssn} | #{company} | #{city}, #{country}"
	count += 1

	FileUtils.mkdir_p path

	locales = locale_txt.split(',').map {|l| l.strip }
	%x(./build.sh #{ssn} #{country_code} "#{country}" "#{state}" "#{city}" "#{company}")

	puts "Writing config files..."

	process(path, ssn, owner, currency, locales)
	user_config(ssn, path, commission)

	# next

	# build, export for signing
	Dir.chdir("#{Dir.home}/projects/sencha-updater")
	puts "Building package..."
	%x(./export_init.sh #{ssn})
	puts "Writing to disk..."
	%x(./signout.sh #{ssn})
#	puts "Funding..."
	Dir.chdir("#{Dir.home}/projects/sencha-brain/hardware/N7G1/build")
	puts
end
p count
puts "Done. #{count} packages created."