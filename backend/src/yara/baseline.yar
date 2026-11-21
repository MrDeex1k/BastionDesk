rule BastionDesk_EICAR_Test_File {
    meta:
        description = "EICAR standard antivirus test artifact"
    strings:
        $signature = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*" ascii
    condition:
        $signature
}
