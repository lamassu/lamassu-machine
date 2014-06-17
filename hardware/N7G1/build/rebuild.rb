# pull in info, generate JSON
require 'json'
require 'csv'
require 'fileutils'
require 'open-uri'
require 'securerandom'
require 'unix_crypt'

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
	
	puts "#{ssn} | #{company} | #{city}, #{country}"
	count += 1

	locales = locale_txt.split(',').map {|l| l.strip }

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
puts "Done. #{count} packages rebuilt."
