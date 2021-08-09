import React from 'react'
import {screen, within, waitFor} from '@testing-library/react'
import user from '@testing-library/user-event'
import {renderWithProviders} from '../utils/test-utils'
import {AuthModal, useAuthModal} from './use-auth-modal'
import {BrowserRouter as Router, Route} from 'react-router-dom'
import Account from '../pages/account'

jest.setTimeout(60000)

const mockRegisteredCustomer = {
    authType: 'registered',
    customerId: 'registeredCustomerId',
    customerNo: 'testno',
    email: 'customer@test.com',
    firstName: 'Tester',
    lastName: 'Testing',
    login: 'customer@test.com'
}

const mockLogin = jest.fn()
jest.useFakeTimers()

jest.mock('../commerce-api/auth', () => {
    return jest.fn().mockImplementation(() => {
        return {
            login: mockLogin.mockImplementation(async () => {
                throw new Error('invalid credentials')
            }),
            getLoggedInToken: jest.fn().mockImplementation(async () => {
                return {customer_id: 'mockcustomerid'}
            })
        }
    })
})

jest.mock('commerce-sdk-isomorphic', () => {
    const sdk = jest.requireActual('commerce-sdk-isomorphic')
    return {
        ...sdk,
        ShopperLogin: class ShopperLoginMock extends sdk.ShopperLogin {
            async getAccessToken() {
                return {
                    access_token: 'accesstoken',
                    refresh_token: 'refreshtoken',
                    customer_id: 'customerId'
                }
            }
            authenticateCustomer() {
                return {url: '/callback'}
            }
        },
        ShopperCustomers: class ShopperCustomersMock extends sdk.ShopperCustomers {
            async registerCustomer() {
                return mockRegisteredCustomer
            }
            async getCustomer(args) {
                if (args.parameters.customerId === 'guestCustomerId') {
                    return {
                        authType: 'guest',
                        customerId: 'guestCustomerId'
                    }
                }
                return mockRegisteredCustomer
            }
            async authorizeCustomer() {
                return {
                    headers: {
                        get(key) {
                            return {authorization: 'guestToken'}[key]
                        }
                    },
                    json: async () => ({
                        authType: 'guest',
                        customerId: 'guestCustomerId'
                    })
                }
            }
            async getResetPasswordToken() {
                return {
                    email: 'foo@test.com',
                    expiresInMinutes: 10,
                    login: 'foo@test.com',
                    resetToken: 'testresettoken'
                }
            }
        }
    }
})

jest.mock('../commerce-api/utils', () => {
    const originalModule = jest.requireActual('../commerce-api/utils')
    return {
        ...originalModule,
        isTokenValid: jest.fn().mockReturnValue(true),
        createGetTokenBody: jest.fn().mockReturnValue({
            grantType: 'test',
            code: 'test',
            usid: 'test',
            codeVerifier: 'test',
            redirectUri: 'http://localhost/test'
        })
    }
})

jest.mock('../commerce-api/pkce', () => {
    return {
        createCodeVerifier: jest.fn().mockReturnValue('codeverifier'),
        generateCodeChallenge: jest.fn().mockReturnValue('codechallenge')
    }
})

const MockedComponent = () => {
    const authModal = useAuthModal()
    const match = {
        params: {pageName: 'profile'}
    }
    return (
        <Router>
            <button onClick={authModal.onOpen}>Open Modal</button>
            <AuthModal {...authModal} />
            <Route path="/en/account">
                <Account match={match} />
            </Route>
        </Router>
    )
}

// Set up and clean up
beforeEach(() => {
    jest.useFakeTimers()
})
afterEach(() => {
    localStorage.clear()
    jest.resetModules()
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
})

test('Renders login modal by default', async () => {
    renderWithProviders(<MockedComponent />)

    // open the modal
    const trigger = screen.getByText(/open modal/i)
    user.click(trigger)

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument()
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument()
    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
})

test('Allows customer to sign in to their account', async () => {
    mockLogin.mockImplementationOnce(async () => {
        return {url: '/callback'}
    })

    // render our test component
    renderWithProviders(<MockedComponent />)

    // open the modal
    const trigger = screen.getByText(/open modal/i)
    user.click(trigger)

    // enter credentials and submit
    user.type(screen.getByLabelText('Email'), 'customer@test.com')
    user.type(screen.getByLabelText('Password'), 'Password!1')
    user.click(screen.getByText(/sign in/i))
    // wait for successful toast to appear
    await waitFor(() => {
        expect(screen.getByText(/Welcome Tester/i)).toBeInTheDocument()
        expect(screen.getByText(/you're now signed in/i)).toBeInTheDocument()
    })
})

test('Renders error when given incorrect log in credentials', async () => {
    // render our test component
    renderWithProviders(<MockedComponent />)

    // open the modal
    const trigger = screen.getByText(/open modal/i)
    user.click(trigger)

    // enter credentials and submit
    user.type(screen.getByLabelText('Email'), 'bad@test.com')
    user.type(screen.getByLabelText('Password'), 'SomeFakePassword1!')
    user.click(screen.getByText(/sign in/i))

    // wait for login error alert to appear
    expect(
        await screen.findByText(/something's not right with your email or password\. try again\./i)
    ).toBeInTheDocument()
})

test('Allows customer to generate password token', async () => {
    // render our test component
    renderWithProviders(<MockedComponent />)

    // open the modal
    const trigger = screen.getByText(/open modal/i)
    user.click(trigger)

    // switch to 'reset password' view
    user.click(screen.getByText(/forgot password/i))

    // enter credentials and submit
    user.type(screen.getByLabelText('Email'), 'foo@test.com')
    user.click(within(screen.getByTestId('sf-auth-modal-form')).getByText(/reset password/i))

    // wait for success state
    expect(await screen.findByText(/password reset/i)).toBeInTheDocument()
    expect(screen.getByText(/foo@test.com/i)).toBeInTheDocument()
})

test('Allows customer to create an account', async () => {
    mockLogin.mockImplementationOnce(async () => {
        return {url: '/callback'}
    })

    // render our test component
    renderWithProviders(<MockedComponent />)

    // open the modal
    const trigger = screen.getByText('Open Modal')

    user.click(trigger)

    // switch to 'create account' view
    user.click(screen.getByText(/create account/i))

    // fill out form and submit
    const withinForm = within(screen.getByTestId('sf-auth-modal-form'))

    user.paste(withinForm.getByLabelText('First Name'), 'Tester')
    user.paste(withinForm.getByLabelText('Last Name'), 'Tester')
    user.paste(withinForm.getByPlaceholderText(/you@email.com/i), 'customer@test.com')
    user.paste(withinForm.getAllByLabelText(/password/i)[0], 'Password!1')
    user.click(withinForm.getByText(/create account/i))

    // wait for redirecting to account page
    expect(await screen.findByText(/customer@test.com/i, {}, {timeout: 30000})).toBeInTheDocument()
    expect(await screen.findByText(/Sign out/i, {}, {timeout: 30000})).toBeInTheDocument()
})