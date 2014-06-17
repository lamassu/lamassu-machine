require 'csv'

csv_file='/home/josh/Documents/lamassu/n7/build/devices.csv'

CSV.foreach(csv_file, { :headers => true }) do |row|
	args = row.fields.map {|f| '"' + (f||'') + '"' }.join(' ')
	cmd = %{./build.sh #{args}} 
  	system(cmd)
end
