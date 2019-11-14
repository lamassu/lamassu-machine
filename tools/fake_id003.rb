require 'pty'
require 'io/console'

# http://www.lammertbies.nl/comm/info/crc-calculation.html (it's Kermit)

class FakeID003
	COMMANDS = {
		0x11 => :status,
		0x50 => :ack,
		0x40 => :reset,
		0x41 => :stack1,
		0x42 => :stack2,
		0x43 => :return,
		0x44 => :hold,
		0x45 => :wait,
		0xc3 => :inhibit,
		0x83 => :inhibit_status,
		0x88 => :version,
		0x89 => :boot_version,
		0x8a => :denominations
	}

	COMMAND_CODES = COMMANDS.invert
	SYNC = 0xfc

	PAYLOADS = {
		:powerUp => [ SYNC, 0x05, 0x40, 0x2B, 0x15 ],
		:initialize => [ SYNC, 0x05, 0x1b, 0x7D, 0xF9 ],
		:ack 		=> [ SYNC, 0x05, 0x50, 0xaa, 0x05 ],
		:disable	=> [ SYNC, 0x05, 0x1a, 0xf4, 0xe8 ],
		:enable		=> [ SYNC, 0x05, 0x11, 0x27, 0x56 ],
		:accepting 	=> [ SYNC, 0x05, 0x12, 0xbc, 0x64 ],
		:escrows 	=> [
			[ SYNC, 0x06, 0x13, 0x61, 0xb0, 0xfb ], # $1
			[ SYNC, 0x06, 0x13, 0x62, 0x2b, 0xc9 ],
			[ SYNC, 0x06, 0x13, 0x63, 0xa2, 0xd8 ], # $5
			[ SYNC, 0x06, 0x13, 0x64, 0x1d, 0xac ], # $10
			[ SYNC, 0x06, 0x13, 0x65, 0x94, 0xbd ], # $20
			[ SYNC, 0x06, 0x13, 0x66, 0x0f, 0x8f ], # $50
			[ SYNC, 0x06, 0x13, 0x67, 0x86, 0x9e ]  # $100
		],
		:returning  => [ SYNC, 0x05, 0x18, 0xe6, 0xcb ],
		:holding	=> [ SYNC, 0x05, 0x19, 0x6f, 0xda ],
		:stacking 	=> [ SYNC, 0x05, 0x14, 0x8a, 0x01 ],
		:vend_valid => [ SYNC, 0x05, 0x15, 0x03, 0x10 ],
		:stacked 	=> [ SYNC, 0x05, 0x16, 0x98, 0x22],
		:version 	=> "\xfc\x29\x88i(ARG)100-SS ID003-05V186-24 18DEC12\xc0\x70",
		:inhibit0   => [ SYNC, 0x06, 0x83, 0x00, 0x62, 0x90 ],
		:inhibit1	=> [ SYNC, 0x06, 0x83, 0x01, 0xeb, 0x81 ],
		:rejecting => [ SYNC, 0x06, 0x17, 0x7e, 0xa6, 0x74 ],
#		:rejecting => [ SYNC, 0x06, 0x17, 0x76, 0xee, 0xf8 ], 	# discrimination
#		:rejecting => [ SYNC, 0x06, 0x17, 0x79,  0x19, 0x00 ], 	# inhibit
		:cashbox_out => [ SYNC, 0x05, 0x44, 0x0f, 0x53 ],
		:acceptor_jam => [ SYNC, 0x05, 0x45, 0x86, 0x42 ],
		:pause => [ SYNC, 0x05, 0x47, 0x94, 0x61 ],
		:denominations => "\xfc\x25\x8a\x61\x01\x01\x00\x62\x00\x00\x00\x63\x01\x05\x00\x64\x01\x0a\x00" +
			"\x65\x01\x14\x00\x66\x01\x32\x00\x67\x01\x64\x00\x68\x00\x00\x00\xf0\x1b"
	}

	def initialize
		@state = :powerUp
		@t0 = nil
		@escrowed = nil
		state_timeout :powerUp, :inhibit
	end

	def run
		@dev, @slave = PTY.open
		@slave.raw!
		puts @slave.path
		STDOUT.flush

		loop do
			process_command
		end
	end

	private

	def dev; @dev end

	def process_command
		loop do
			res = IO.select( [ dev, STDIN ] )
			res.first.each do |io|
				case io
				when STDIN
					process_user_input!
				else
					process_dev_input!
				end
			end
		end

	end

	def process_user_input!
		res = gets
		if res =~ /^cashbox/
			set_state :cashbox_out
			return
		elsif res =~ /^jam/
			set_state :acceptor_jam
			return
		end

		number = res.to_i
		bills = [ 1, nil, 5, 10, 20, 50, 100 ]
		i = bills.index number
		if number == 3
			@escrowed = 1
			@rejecting = :refuse
		elsif number == 4
			@escrowed = 1
			@rejecting = :reject
		else
			@escrowed = i
			@rejecting = nil
		end
		# DEBUG set_state :accepting
		set_state :escrow
	end

	def process_dev_input!
		sync = dev.getbyte
		if sync == SYNC
			len = dev.getbyte
			payload = dev.read(len - 2)
			cmd_code = payload[0].ord
			data = payload[1, len - 5]
			@incoming = [ SYNC, len ].pack('C*') + payload
			p [cmd_code, data] if cmd_code != 0x11
			execute_command(cmd_code, data)
		end
	end

	def execute_command(code, data)
		cmd = COMMANDS[code]
		p [cmd, data] if cmd != :status
		case cmd
		when :reset
			set_state(:initialize)
			dispatch payload(:ack)
		when :disable
			set_state(:disable)
			dispatch payload(:disable)
		when :inhibit
			@inhibited = (data.ord == 0x01)
			if @inhibited
				set_state(:inhibit)
			else
				set_state(:enable)
			end
			echo
		when :inhibit_status
			if @inhibited
				dispatch payload(:inhibit1)
			else
				dispatch payload(:inhibit0)
			end
		when :status
			dispatch(bill_handling)
		when :return
			set_state :returning
			dispatch payload(:ack)
		when :stack1
			set_state :stacking
			dispatch payload(:ack)
		when :hold
			set_state :holding
			dispatch payload(:ack)
		when :ack
			case @state
			when :vend_valid
				set_state :stacked
			end
		when :version
			dev.write payload(:version)
		when :denominations
			dev.write payload(:denominations)
		end
	end

	def echo
		dev.write(@incoming)
	end

	def bill_handling
		if @t0 && (Time.now - @t0) > 1
			puts 'timeout'
			STDOUT.flush
			set_state @next_state
			@next_state = nil
			@t0 = nil
		end

		case @state
		when :powerUp
			payload(:powerUp)
		when :initialize
			state_timeout :initialize, :disable
			payload(:initialize)
		when :enable
			payload :enable
		when :disable
			payload :disable
		when :inhibit
			payload :disable
		when :accepting
			if (@rejecting == :reject)
				state_timeout :accepting, :rejecting
			else
				state_timeout :accepting, :escrow
			end
			payload(:accepting)
		when :returning
			state_timeout :returning, :enable
			payload(:returning);
		when :rejecting
			state_timeout :rejecting, :enable
			payload(:rejecting)
		when :escrow
			PAYLOADS[:escrows][@escrowed]
		when :stacking
			if @rejecting == :refuse
				state_timeout :stacking, :rejecting
			else
				state_timeout :stacking, :vend_valid
			end
			payload :stacking
		when :vend_valid
			payload :vend_valid
		when :stacked
			state_timeout :stacked, :enable
			payload :stacked
		when :holding
			payload :holding
		when :cashbox_out
			state_timeout :cashbox_out, :initialize
			payload :cashbox_out
		when :acceptor_jam
			state_timeout :acceptor_jam, :initialize
			payload :acceptor_jam
		when :pause
			state_timeout :pause, :accepting
			payload :pause
		end
	end

	def set_state(state)
		@state = state
	end

	def state_timeout(old_state, new_state)
		return if @t0
		@t0 = Time.now
		@next_state = new_state
	end

	def payload(state)
		if state == :escrow
			PAYLOADS[:escrows][@escrowed]
		else
			PAYLOADS[state]
		end
	end

	def dispatch(payload)
		dev.write(payload.pack('C*'))
	end

	def respond(cmd)
		code = COMMAND_CODES[cmd]
		payload = [ SYNC, 0x05, code, 0xaa, 0x05 ]
		dispatch payload
	end
end

fi = FakeID003.new
fi.run
