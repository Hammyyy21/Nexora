	.text
	.syntax unified
	.eabi_attribute	67, "2.09"	@ Tag_conformance
	.cpu	cortex-m3
	.eabi_attribute	6, 10	@ Tag_CPU_arch
	.eabi_attribute	7, 77	@ Tag_CPU_arch_profile
	.eabi_attribute	8, 0	@ Tag_ARM_ISA_use
	.eabi_attribute	9, 2	@ Tag_THUMB_ISA_use
	.eabi_attribute	34, 0	@ Tag_CPU_unaligned_access
	.eabi_attribute	17, 1	@ Tag_ABI_PCS_GOT_use
	.eabi_attribute	20, 1	@ Tag_ABI_FP_denormal
	.eabi_attribute	21, 0	@ Tag_ABI_FP_exceptions
	.eabi_attribute	23, 3	@ Tag_ABI_FP_number_model
	.eabi_attribute	24, 1	@ Tag_ABI_align_needed
	.eabi_attribute	25, 1	@ Tag_ABI_align_preserved
	.eabi_attribute	38, 1	@ Tag_ABI_FP_16bit_format
	.eabi_attribute	18, 4	@ Tag_ABI_PCS_wchar_t
	.eabi_attribute	26, 2	@ Tag_ABI_enum_size
	.eabi_attribute	14, 0	@ Tag_ABI_PCS_R9_use
	.file	"cooling.c"
	.globl	sensor_read_celsius             @ -- Begin function sensor_read_celsius
	.p2align	1
	.type	sensor_read_celsius,%function
	.code	16                              @ @sensor_read_celsius
	.thumb_func
sensor_read_celsius:
	.fnstart
@ %bb.0:
	ldr	r0, [r0]
	bx	lr
.Lfunc_end0:
	.size	sensor_read_celsius, .Lfunc_end0-sensor_read_celsius
	.cantunwind
	.fnend
                                        @ -- End function
	.globl	fan_set_duty                    @ -- Begin function fan_set_duty
	.p2align	1
	.type	fan_set_duty,%function
	.code	16                              @ @fan_set_duty
	.thumb_func
fan_set_duty:
	.fnstart
@ %bb.0:
	str	r1, [r0]
	bx	lr
.Lfunc_end1:
	.size	fan_set_duty, .Lfunc_end1-fan_set_duty
	.cantunwind
	.fnend
                                        @ -- End function
	.globl	update_fan                      @ -- Begin function update_fan
	.p2align	1
	.type	update_fan,%function
	.code	16                              @ @update_fan
	.thumb_func
update_fan:
	.fnstart
@ %bb.0:
	ldr	r0, [r0]
	movs	r2, #0
	cmp	r0, #30
	it	gt
	movgt	r2, #100
	str	r2, [r1]
	bx	lr
.Lfunc_end2:
	.size	update_fan, .Lfunc_end2-update_fan
	.cantunwind
	.fnend
                                        @ -- End function
	.ident	"Apple clang version 16.0.0 (clang-1600.0.26.6)"
	.section	".note.GNU-stack","",%progbits
	.addrsig
	.eabi_attribute	30, 1	@ Tag_ABI_optimization_goals
