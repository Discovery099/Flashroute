import type { AuthService, RequestContext } from '../auth/auth.service';
import type { ChangePasswordInput, UpdateProfileInput } from '../auth/auth.schemas';

export class UserService {
  public constructor(private readonly authService: AuthService) {}

  public async getProfile(userId: string) {
    return this.authService.toUserDto(await this.authService.requireUser(userId));
  }

  public async updateProfile(userId: string, input: UpdateProfileInput) {
    return this.authService.toUserDto(await this.authService.updateProfile(userId, input));
  }

  public async changePassword(userId: string, input: ChangePasswordInput) {
    await this.authService.changePassword(userId, input.currentPassword, input.newPassword);
  }

  public async setupTwoFactor(userId: string, context: RequestContext) {
    return this.authService.setupTwoFactor(userId, context);
  }

  public async verifyTwoFactor(userId: string, code: string, context: RequestContext) {
    return this.authService.verifyTwoFactor(userId, code, context);
  }

  public async disableTwoFactor(userId: string, code: string, context: RequestContext) {
    return this.authService.disableTwoFactor(userId, code, context);
  }
}
