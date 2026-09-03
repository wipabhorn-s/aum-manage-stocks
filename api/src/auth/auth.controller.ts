import { AuthService } from '@/auth/auth.service';
import { ForgotPasswordDto } from '@/auth/dto/forgot-password.dto';
import { LoginDto } from '@/auth/dto/login.dto';
import { OAuthCallbackDto } from '@/auth/dto/oauth-callback.dto';
import { RefreshTokenDto } from '@/auth/dto/refresh-token.dto';
import { RegisterDto } from '@/auth/dto/register.dto';
import { ResetPasswordDto } from '@/auth/dto/reset-password.dto';
import { TwoFactorConfirmDto } from '@/auth/dto/two-factor-confirm.dto';
import { TwoFactorDisableDto } from '@/auth/dto/two-factor-disable.dto';
import { VerifyEmailDto } from '@/auth/dto/verify-email.dto';
import { TwoFactorRecoveryDto } from '@/auth/dto/two-factor-recovery.dto';
import { TwoFactorVerifyDto } from '@/auth/dto/two-factor-verify.dto';
import { RequestEmailChangeDto } from '@/users/dto/request-email-change.dto';
import { CurrentUser } from '@/common/decorator/current-user.decorator';
import { Protected, Public } from '@/common/decorator/public.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    // emailSent = false แปลว่าบัญชีถูกสร้างแล้วแต่เมลยืนยันส่งไม่ออก
    // ฝั่งเว็บเอาไปบอกให้ผู้ใช้กดขอลิงก์ใหม่ แทนที่จะนั่งรอเมลที่ไม่มีวันมา
    const { emailSent } = await this.authService.register(registerDto);
    return { message: 'Register successfully', emailSent };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('line/callback')
  async lineCallback(@Query() query: OAuthCallbackDto) {
    return this.authService.loginWithLine(query.code);
  }

  @Get('google/callback')
  async googleCallback(@Query() query: OAuthCallbackDto) {
    return this.authService.loginWithGoogle(query.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() refreshTokenDto: RefreshTokenDto) {
    await this.authService.logout(refreshTokenDto.refreshToken);
    return { message: 'Logout successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.forgotPassword(forgotPasswordDto.email);
    return { message: 'If the email exists, a reset link has been sent' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
    return { message: 'Password reset successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    await this.authService.verifyEmail(verifyEmailDto.token);
    return { message: 'Email verified successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.resendVerificationEmail(forgotPasswordDto.email);
    return {
      message:
        'If the email exists and is unverified, a new link has been sent',
    };
  }

  @Protected()
  @HttpCode(HttpStatus.OK)
  @Post('email-change')
  async requestEmailChange(
    @CurrentUser('sub') userId: string,
    @Body() dto: RequestEmailChangeDto,
  ) {
    await this.authService.requestEmailChange(
      userId,
      dto.email,
      dto.currentPassword ?? '',
    );
    return { message: 'Verification email sent' };
  }

  @Protected()
  @Post('2fa/enable')
  async enable2fa(@CurrentUser('sub') userId: string) {
    return this.authService.enable2fa(userId);
  }

  @Protected()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/confirm')
  async confirm2fa(
    @CurrentUser('sub') userId: string,
    @Body() twoFactorConfirmDto: TwoFactorConfirmDto,
  ) {
    return this.authService.confirm2fa(userId, twoFactorConfirmDto.otpCode);
  }

  @HttpCode(HttpStatus.OK)
  @Post('2fa/verify')
  async verify2fa(@Body() twoFactorVerifyDto: TwoFactorVerifyDto) {
    return this.authService.verifyTwoFactorLogin(
      twoFactorVerifyDto.challengeToken,
      twoFactorVerifyDto.otpCode,
    );
  }

  @Protected()
  @HttpCode(HttpStatus.OK)
  @Post('2fa/disable')
  async disable2fa(
    @CurrentUser('sub') userId: string,
    @Body() twoFactorDisableDto: TwoFactorDisableDto,
  ) {
    await this.authService.disable2fa(userId, twoFactorDisableDto);
    return { message: '2FA disabled successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('2fa/recovery')
  async useRecoveryCode(@Body() twoFactorRecoveryDto: TwoFactorRecoveryDto) {
    return this.authService.loginWithRecoveryCode(
      twoFactorRecoveryDto.challengeToken,
      twoFactorRecoveryDto.recoveryCode,
    );
  }
}
